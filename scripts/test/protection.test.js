import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createProtection,
  DEFAULT_RESTORE_DELAY_MS,
} from "../src/diablos/lib/protection.js";

async function makeDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diablos-protection-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function noWait() {
  return Promise.resolve();
}

test("protection restoration has no fifteen-second hold", () => {
  assert.equal(DEFAULT_RESTORE_DELAY_MS, 0);
});

test("protection restores the group and current members, continuing after one nickname fails", async (t) => {
  const directory = await makeDirectory(t);
  const info = {
    threadName: "Original group",
    participantIDs: ["member-1", "member-2", "former-member"],
    nicknames: {
      "member-1": "First baseline",
      "member-2": "Second baseline",
      "former-member": "Former baseline",
    },
  };
  const calls = [];
  const errors = [];
  const api = {
    getThreadInfo: async () => ({
      ...info,
      participantIDs: [...info.participantIDs],
      nicknames: { ...info.nicknames },
    }),
    gcname: async (name) => {
      calls.push(["name", name]);
      info.threadName = name;
    },
    nickname: async (nickname, threadId, participantId) => {
      calls.push(["nickname", participantId, nickname]);
      if (participantId === "member-1") throw new Error("permission denied");
      info.nicknames[participantId] = nickname;
    },
  };
  const protection = createProtection(api, (message) => errors.push(message), {
    directory,
    restoreDelayMs: 0,
    nicknameChangeDelayMs: 0,
    wait: noWait,
  });

  await protection.enable("group");
  info.threadName = "Changed group";
  info.participantIDs = ["member-1", "member-2", "bot"];
  info.nicknames["member-1"] = "Changed first";
  info.nicknames["member-2"] = "Changed second";
  info.nicknames.bot = "";
  await protection.scheduleRestore("group");
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(info.threadName, "Original group");
  assert.equal(info.nicknames["member-1"], "Changed first");
  assert.equal(info.nicknames["member-2"], "Second baseline");
  assert.deepEqual(calls, [
    ["name", "Original group"],
    ["nickname", "member-1", "First baseline"],
    ["nickname", "member-2", "Second baseline"],
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /تعذر استعادة كنية عضو/);

  const saved = JSON.parse(await readFile(path.join(directory, "group.json"), "utf8"));
  assert.equal(saved.enabled, true);
  assert.equal(saved.nicknames.bot, "");
});

test("disabling protection during a restore cancels later restore actions", async (t) => {
  const directory = await makeDirectory(t);
  let threadInfo = {
    threadName: "Baseline",
    participantIDs: ["member"],
    nicknames: { member: "baseline" },
  };
  let blockInfo = false;
  let releaseInfo;
  let announceStarted;
  const started = new Promise((resolve) => {
    announceStarted = resolve;
  });
  const blocked = new Promise((resolve) => {
    releaseInfo = resolve;
  });
  const calls = [];
  const api = {
    getThreadInfo: async () => {
      if (blockInfo) {
        announceStarted();
        await blocked;
      }
      return {
        ...threadInfo,
        participantIDs: [...threadInfo.participantIDs],
        nicknames: { ...threadInfo.nicknames },
      };
    },
    gcname: async (...args) => calls.push(["name", ...args]),
    nickname: async (...args) => calls.push(["nickname", ...args]),
  };
  const protection = createProtection(api, () => {}, {
    directory,
    restoreDelayMs: 0,
    nicknameChangeDelayMs: 0,
    wait: noWait,
  });

  await protection.enable("group");
  threadInfo = {
    threadName: "Changed",
    participantIDs: ["member"],
    nicknames: { member: "changed" },
  };
  blockInfo = true;
  await protection.scheduleRestore("group");
  await started;
  assert.equal(await protection.disable("group"), true);
  releaseInfo();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(calls, []);
  assert.equal((await protection.status("group")).enabled, false);
});

test("invalid protection snapshots are rejected instead of used", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(
    path.join(directory, "group.json"),
    JSON.stringify({
      threadId: "group",
      enabled: true,
      groupName: "Group",
      nicknames: null,
    }),
  );
  const protection = createProtection({}, () => {}, { directory });

  await assert.rejects(protection.status("group"), /Invalid protection backup format/);
});

test("clearing all backups removes snapshots, cache, temporary files, and timers", async (t) => {
  const directory = await makeDirectory(t);
  let threadInfoCalls = 0;
  const protection = createProtection(
    {
      getThreadInfo: async () => {
        threadInfoCalls += 1;
        return { threadName: "Group", participantIDs: [], nicknames: {} };
      },
    },
    () => {},
    { directory, restoreDelayMs: 20 },
  );

  await protection.enable("101");
  await protection.enable("202");
  await writeFile(path.join(directory, "303.json.tmp"), "stale snapshot");
  await writeFile(path.join(directory, "notes.txt"), "keep this file");
  await protection.scheduleRestore("101");
  await protection.scheduleRestore("202");

  const result = await protection.clearAllBackups();
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.deepEqual(result, { deleted: 3, failed: 0 });
  assert.equal((await protection.status("101")).enabled, false);
  assert.equal((await protection.status("202")).enabled, false);
  assert.equal(threadInfoCalls, 2);
  assert.equal(await readFile(path.join(directory, "notes.txt"), "utf8"), "keep this file");
  await assert.rejects(readFile(path.join(directory, "101.json")), {
    code: "ENOENT",
  });
  await assert.rejects(readFile(path.join(directory, "202.json")), {
    code: "ENOENT",
  });
});

test("clearing all backups cancels an in-flight restore before deleting its snapshot", async (t) => {
  const directory = await makeDirectory(t);
  let blockInfo = false;
  let announceRestore;
  let releaseInfo;
  const restoreStarted = new Promise((resolve) => {
    announceRestore = resolve;
  });
  const blockedInfo = new Promise((resolve) => {
    releaseInfo = resolve;
  });
  const calls = [];
  const protection = createProtection(
    {
      getThreadInfo: async () => {
        if (blockInfo) {
          announceRestore();
          await blockedInfo;
        }
        return {
          threadName: "Changed",
          participantIDs: ["member"],
          nicknames: { member: "changed" },
        };
      },
      gcname: async (...args) => calls.push(["name", ...args]),
      nickname: async (...args) => calls.push(["nickname", ...args]),
    },
    () => {},
    { directory, restoreDelayMs: 0, wait: noWait },
  );

  await protection.enable("303");
  blockInfo = true;
  await protection.scheduleRestore("303");
  await restoreStarted;

  const clearing = protection.clearAllBackups();
  releaseInfo();
  const result = await clearing;

  assert.deepEqual(result, { deleted: 1, failed: 0 });
  assert.deepEqual(calls, []);
  await assert.rejects(readFile(path.join(directory, "303.json")), {
    code: "ENOENT",
  });
});

test("a protection enable already in progress cannot recreate a deleted backup", async (t) => {
  const directory = await makeDirectory(t);
  let announceRead;
  let releaseRead;
  const readStarted = new Promise((resolve) => {
    announceRead = resolve;
  });
  const blockedRead = new Promise((resolve) => {
    releaseRead = resolve;
  });
  const protection = createProtection(
    {
      getThreadInfo: async () => {
        announceRead();
        await blockedRead;
        return { threadName: "Group", participantIDs: [], nicknames: {} };
      },
    },
    () => {},
    { directory },
  );

  const enabling = protection.enable("404");
  await readStarted;
  assert.deepEqual(await protection.clearAllBackups(), {
    deleted: 0,
    failed: 0,
  });
  releaseRead();

  await assert.rejects(enabling, /تم حذف نسخ الحماية أثناء تنفيذ العملية/);
  await assert.rejects(readFile(path.join(directory, "404.json")), {
    code: "ENOENT",
  });
});
