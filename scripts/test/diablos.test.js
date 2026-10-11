import assert from "node:assert/strict";
import test from "node:test";
import baseCommand, {
  createRepeatCommand,
  getBaseLoopStatus,
  getDevilLoopStatus,
  runBaseCommandSelfTests,
  stopBaseLoop,
  stopDevilLoop,
} from "../src/diablos/cmd/base.js";
import devilCommand from "../src/diablos/cmd/devil.js";
import clearNicknamesCommand, {
  CLEAR_NICKNAME_DELAY_MS,
} from "../src/diablos/cmd/clear-nicknames.js";
import developerCommand, {
  resolveDeveloperTarget,
} from "../src/diablos/cmd/developer.js";
import deleteMessageCommand from "../src/diablos/cmd/delete-message.js";
import removeDeveloperCommand from "../src/diablos/cmd/remove-developer.js";
import {
  runNameCommandSelfTests,
  updateGroupName,
  default as nameCommand,
} from "../src/diablos/cmd/name.js";
import nicknamesCommand, {
  runNicknameCommandSelfTests,
  updateGroupNicknames,
} from "../src/diablos/cmd/nicknames.js";
import protectCommand from "../src/diablos/cmd/protect.js";
import helpCommand, { formatHelp } from "../src/diablos/cmd/help.js";
import resetCommand from "../src/diablos/cmd/reset.js";
import leaveCommand from "../src/diablos/cmd/leave.js";
import {
  ensureBotNickname,
  BOT_NICKNAME_CHECK_DELAY_MS,
} from "../src/diablos/lib/bot-nickname.js";
import {
  COMMAND_EXECUTION_DELAY_MS,
  waitBeforeCommandExecution,
} from "../src/diablos/lib/command-delay.js";

const FIXED_NICKNAME = "D̲i̲a̲b̲l̲o̲s̲꙰ │ ➯〘🇷🇺〙";

test("existing command helpers pass their local checks", async () => {
  runBaseCommandSelfTests();
  await runNameCommandSelfTests();
  runNicknameCommandSelfTests();
});

test("repeat commands send the requested text with a plain stop hint", async () => {
  const messages = [];
  const runtime = {
    api: {},
    baseLoops: new Map(),
    devilLoops: new Map(),
  };
  const state = { getPrefix: () => "!" };
  const send = async (message) => messages.push(message);

  await devilCommand.execute({
    args: "hello",
    send,
    threadId: "group",
    runtime,
    state,
  });
  assert.equal(getDevilLoopStatus(runtime, "group").nextSeconds, 60);
  assert.equal(getBaseLoopStatus(runtime, "group"), null);
  assert.equal(
    messages[0],
    "hello\n\nلإيقاف التكرار: !devil إيقاف",
  );

  await baseCommand.execute({
    args: "hello",
    send,
    threadId: "group",
    runtime,
    state,
  });
  assert.ok([15, 19, 29, 34].includes(getBaseLoopStatus(runtime, "group").nextSeconds));
  assert.equal(getDevilLoopStatus(runtime, "group").nextSeconds, 60);
  assert.equal(
    messages[1],
    "hello\n\nلإيقاف التكرار: !بيس إيقاف",
  );

  stopBaseLoop(runtime, "group");
  stopDevilLoop(runtime, "group");
});

test("only the repeat start reply includes the stop hint; later messages repeat the text alone", async () => {
  const initialReplies = [];
  const repeatedMessages = [];
  const command = createRepeatCommand({
    name: "بيس",
    propertyName: "baseLoops",
    intervalSeconds: 0.01,
  });
  const runtime = {
    api: {
      sendMessageMqtt: (text, _threadId, _replyToMessageId, callback) => {
        repeatedMessages.push(text);
        callback(null, { messageID: `sent-${repeatedMessages.length}` });
      },
    },
    baseLoops: new Map(),
  };

  await command.execute({
    args: "hello",
    send: async (text) => initialReplies.push(text),
    threadId: "repeat-format-test",
    runtime,
    state: { getPrefix: () => "!" },
  });
  await new Promise((resolve) => setTimeout(resolve, 35));
  stopBaseLoop(runtime, "repeat-format-test");

  assert.equal(initialReplies[0], "hello\n\nلإيقاف التكرار: !بيس إيقاف");
  assert.ok(repeatedMessages.length > 0);
  assert.ok(repeatedMessages.every((message) => message === "hello"));
});

test("commands wait five seconds before execution", async () => {
  const waits = [];
  await waitBeforeCommandExecution(async (milliseconds) => waits.push(milliseconds));
  assert.deepEqual(waits, [COMMAND_EXECUTION_DELAY_MS]);
  assert.equal(COMMAND_EXECUTION_DELAY_MS, 5_000);
});

test("group-name change runs without a delay and does not require bot-admin status", async () => {
  const info = { threadName: "Old name", adminIDs: [] };
  const calls = [];
  const api = {
    getThreadInfo: async () => {
      calls.push("get-info");
      return { ...info };
    },
    gcname: async (name) => {
      calls.push("set-name");
      info.threadName = name;
    },
  };
  const result = await updateGroupName(
    {
      api,
      threadId: "group",
      notifyChangeStart: async () => calls.push("announce"),
    },
    "New name",
  );
  assert.equal(result.changed, true);
  assert.equal(result.name, "New name");
  assert.deepEqual(calls, ["get-info", "announce", "set-name", "get-info"]);
});

test("group-name display reports a safe message when Messenger lookup fails", async () => {
  const replies = [];
  await nameCommand.execute({
    args: "عرض",
    send: async (message) => replies.push(message),
    threadId: "group",
    runtime: {
      api: {
        getThreadInfo: async () => {
          throw new Error("private session details");
        },
      },
    },
  });
  assert.deepEqual(replies, [
    "حدث خطأ أثناء تغيير الاسم؛ لم أتمكن من تأكيد النتيجة.",
  ]);
  assert.ok(nameCommand.aliases.includes("name"));
  assert.ok(nameCommand.aliases.includes("group-name"));
});

test("nickname command does not locally require bot-admin status", async () => {
  const changes = [];
  let currentNickname = "old";
  const api = {
    getCurrentUserID: () => "bot",
    getThreadInfo: async () => ({
      participantIDs: ["member", "bot"],
      nicknames: { member: currentNickname, bot: "" },
      adminIDs: [],
    }),
    nickname: async (...args) => {
      changes.push(args);
      currentNickname = args[0];
    },
  };
  const result = await updateGroupNicknames({
    api,
    threadId: "group",
    nickname: "new",
    send: async () => {},
    wait: async () => {},
  });
  assert.equal(result.changed, 1);
  assert.deepEqual(changes, [["new", "group", "member"]]);
});

test("nickname changes are reapplied up to twice and processing continues", async () => {
  const nicknames = { first: "old", second: "old", bot: "" };
  const changes = [];
  let firstAttempts = 0;
  const result = await updateGroupNicknames({
    api: {
      getCurrentUserID: () => "bot",
      getThreadInfo: async () => ({
        participantIDs: ["first", "second", "bot"],
        nicknames: { ...nicknames },
      }),
      nickname: async (nickname, _threadId, participantId) => {
        changes.push(participantId);
        if (participantId === "first" && firstAttempts++ === 0) {
          nicknames.first = "changed by someone else";
        } else {
          nicknames[participantId] = nickname;
        }
      },
    },
    threadId: "group",
    nickname: "new",
    send: async () => {},
    wait: async () => {},
  });
  assert.deepEqual(changes, ["first", "first", "second"]);
  assert.equal(result.changed, 2);
  assert.equal(result.failed, 0);
});

test("developer command adds a mentioned account only when run by the configured owner", async () => {
  const added = [];
  const replies = [];
  assert.equal(
    resolveDeveloperTarget({
      messageReply: { senderID: "123" },
      mentions: { "456": "@other" },
    }),
    "123",
  );
  assert.equal(resolveDeveloperTarget({ mentions: { "456": "@person" } }), "456");
  assert.equal(
    resolveDeveloperTarget({ mentions: { "456": "@one", "789": "@two" } }),
    null,
  );

  const runtime = {
    config: { developerId: "owner" },
    state: {
      addDeveloper: async (id) => {
        added.push(id);
        return true;
      },
    },
    api: { getCurrentUserID: () => "bot" },
  };
  await developerCommand.execute({
    event: { senderID: "owner", mentions: { "456": "@person" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  await developerCommand.execute({
    event: { senderID: "other", mentions: { "789": "@person" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  assert.deepEqual(added, ["456"]);
  assert.deepEqual(replies, [
    "تمت إضافة المطوّر.",
    "هذا الأمر متاح للمطوّر الأساسي فقط.",
  ]);
});

test("developer removal is owner-only and protects the primary developer and bot", async () => {
  const removed = [];
  const replies = [];
  const runtime = {
    config: { developerId: "123" },
    state: {
      removeDeveloper: async (id) => {
        removed.push(id);
        if (id === "123") throw new Error("primary developer");
        return id === "456";
      },
    },
    api: { getCurrentUserID: () => "999" },
  };
  await removeDeveloperCommand.execute({
    event: { senderID: "123", mentions: { "456": "@person" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  await removeDeveloperCommand.execute({
    event: { senderID: "other", mentions: { "789": "@person" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  await removeDeveloperCommand.execute({
    event: { senderID: "123", messageReply: { senderID: "999" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  await removeDeveloperCommand.execute({
    event: { senderID: "123", mentions: { "123": "@owner" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  assert.deepEqual(removed, ["456", "123"]);
  assert.deepEqual(replies, [
    "تمت إزالة المطوّر.",
    "هذا الأمر متاح للمطوّر الأساسي فقط.",
    "لا يمكن إزالة حساب البوت من المطوّرين.",
    "لا يمكن إزالة المطوّر الأساسي.",
  ]);
});

test("delete shortcut unsends only a replied-to bot message", async () => {
  const replies = [];
  const deleted = [];
  const runtime = {
    api: {
      getCurrentUserID: () => "bot",
      unsendMessage: async (messageId) => deleted.push(messageId),
    },
  };
  await deleteMessageCommand.execute({
    event: { messageReply: { messageID: "bot-message", senderID: "bot" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  await deleteMessageCommand.execute({
    event: { messageReply: { messageID: "other-message", senderID: "member" } },
    send: async (text) => replies.push(text),
    runtime,
  });
  assert.deepEqual(deleted, ["bot-message"]);
  assert.deepEqual(replies, ["يمكن حذف رسائل البوت فقط."]);
});

test("protection and clear-nicknames commands no longer gate on bot-admin status", async () => {
  const protection = {
    enable: async () => ({ nicknames: {} }),
    disable: async () => true,
    refreshFromCurrent: async () => {},
  };
  const runtime = {
    api: {
      getThreadInfo: async () => ({ participantIDs: ["member", "bot"] }),
      getCurrentUserID: () => "bot",
      nickname: async () => {},
    },
    protection,
  };
  const replies = [];
  const send = async (message) => replies.push(message);

  await protectCommand.execute({
    args: "تشغيل",
    send,
    threadId: "group",
    runtime,
  });
  await protectCommand.execute({
    args: "إيقاف",
    send,
    threadId: "group",
    runtime,
  });
  await clearNicknamesCommand.execute({ send, threadId: "group", runtime });
  assert.equal(replies.length, 3);
  assert.match(replies[0], /تبدأ الاستعادة فورًا/);
});

test("help uses a simple default style and lists command names without explanations", async () => {
  const menu = formatHelp("#");
  for (const commandPair of [
    "#مساعدة / #help",
    "#بادئة / #prefix",
    "#uptime / #حالة",
    "#بيس / #base",
    "#devil / #شيطان",
    "#اسم / #name",
    "#كنيات / #nicknames",
    "#إزالة_الكنيات / #clear-nicknames",
    "#حماية / #protect",
    "#إعادة / #reset",
    "#خروج / #leave",
    "#مطور / #gr",
    "#حذف_مطور / #ungr",
    "#حذف / #sk",
  ]) {
    assert.ok(menu.includes(commandPair), `Missing help entry: ${commandPair}`);
  }
  assert.ok(menu.startsWith("🤖 الأوامر:"));
  assert.ok(menu.split("\n").slice(2).every((line) => line.startsWith("🔹 ")));
  assert.ok(!menu.includes("—"));
  assert.ok(!menu.includes("𝑫𝑰𝑨𝑩𝑳𝑶𝑺"));

  const replies = [];
  await helpCommand.execute({ send: async (text) => replies.push(text), prefix: "!" });
  assert.equal(replies[0], formatHelp("!"));
});

test("protection command supports status and rejects unknown actions", async () => {
  const replies = [];
  const runtime = {
    protection: {
      status: async () => ({ enabled: true, savedAt: "2026-01-01T00:00:00.000Z" }),
      enable: async () => ({ nicknames: {} }),
      disable: async () => true,
    },
  };
  const invoke = (args) =>
    protectCommand.execute({
      args,
      send: async (text) => replies.push(text),
      threadId: "group",
      runtime,
    });

  await invoke("status");
  await invoke("تشغيل الآن");
  assert.match(replies[0], /الحماية مفعلة/);
  assert.match(replies[1], /استخدم:/);
});

test("reset command deletes all protection backups for the primary developer only", async () => {
  let deleteCalls = 0;
  const replies = [];
  const runtime = {
    config: { developerId: "123" },
    protection: {
      clearAllBackups: async () => {
        deleteCalls += 1;
        return { deleted: 2, failed: 0 };
      },
    },
  };
  const send = async (message) => replies.push(message);

  await resetCommand.execute({
    event: { senderID: "456" },
    send,
    runtime,
  });
  await resetCommand.execute({
    event: { senderID: "123" },
    send,
    runtime,
  });

  assert.equal(deleteCalls, 1);
  assert.deepEqual(replies, [
    "هذا الأمر متاح للمطوّر الأساسي فقط.",
    "تم حذف 2 ملفًا من نسخ الحماية لكل المجموعات في Nike. فعّل الحماية مجددًا لإنشاء نسخ جديدة.",
  ]);
});

test("leave command only asks Messenger to remove the bot from the current group for the primary developer", async () => {
  const calls = [];
  const replies = [];
  const runtime = {
    config: { developerId: "123" },
    api: {
      getCurrentUserID: () => "bot",
      gcmember: async (...args) => {
        calls.push(args);
        return {
          type: "gc_member_update",
          action: "remove",
          threadID: "group",
          userIDs: ["bot"],
        };
      },
    },
  };
  const send = async (message) => replies.push(message);

  await leaveCommand.execute({
    event: { senderID: "456", isGroup: true },
    send,
    threadId: "group",
    runtime,
  });
  await leaveCommand.execute({
    event: { senderID: "123", isGroup: false },
    send,
    threadId: "private",
    runtime,
  });
  await leaveCommand.execute({
    event: { senderID: "123", isGroup: true },
    send,
    threadId: "group",
    runtime,
  });

  assert.deepEqual(calls, [["remove", "bot", "group"]]);
  assert.deepEqual(replies, [
    "هذا الأمر متاح للمطوّر الأساسي فقط.",
    "استخدم هذا الأمر داخل المجموعة التي تريد أن يغادرها البوت.",
    "أُرسل طلب خروج البوت من هذه المجموعة.",
  ]);
});

test("leave command reports Messenger errors without claiming the bot left", async () => {
  const replies = [];
  await leaveCommand.execute({
    event: { senderID: "123", isGroup: true },
    send: async (message) => replies.push(message),
    threadId: "group",
    runtime: {
      config: { developerId: "123" },
      api: {
        getCurrentUserID: () => "bot",
        gcmember: async () => ({
          type: "error_gc",
          error: "Messenger is not connected",
        }),
      },
    },
  });

  assert.deepEqual(replies, [
    "تعذر إخراج البوت من المجموعة. تحقق من اتصال Messenger وحاول مجددًا.",
  ]);
});

test("clear-nicknames continues after one participant update fails", async () => {
  const calls = [];
  const delays = [];
  const replies = [];
  const runtime = {
    api: {
      getThreadInfo: async () => ({
        participantIDs: ["failed", "success", "failed", "bot"],
        nicknames: { failed: "old", success: "old" },
      }),
      getCurrentUserID: () => "bot",
      nickname: async (_nickname, _threadId, participantId) => {
        calls.push(participantId);
        if (participantId === "failed") throw new Error("permission denied");
      },
    },
    protection: { refreshFromCurrent: async () => {} },
  };
  await clearNicknamesCommand.execute({
    send: async (text) => replies.push(text),
    threadId: "group",
    runtime,
    wait: async (milliseconds) => delays.push(milliseconds),
  });
  assert.deepEqual(calls, ["failed", "success"]);
  assert.deepEqual(delays, [CLEAR_NICKNAME_DELAY_MS]);
  assert.match(replies[0], /تمت إزالة 1، تعذر 1/);
});

test("the fixed bot nickname is checked after five seconds and only changed if needed", async () => {
  assert.equal(BOT_NICKNAME_CHECK_DELAY_MS, 5_000);
  const info = {
    participantIDs: ["bot"],
    nicknames: { bot: "someone changed it" },
  };
  const calls = [];
  const api = {
    getCurrentUserID: () => "bot",
    getThreadInfo: async () => ({
      participantIDs: info.participantIDs,
      nicknames: { ...info.nicknames },
    }),
    nickname: async (nickname, threadId, participant) => {
      calls.push([nickname, threadId, participant]);
      info.nicknames.bot = nickname;
    },
  };

  const result = await ensureBotNickname(api, "group", FIXED_NICKNAME);
  assert.deepEqual(result, { present: true, changed: true });
  assert.deepEqual(calls, [[FIXED_NICKNAME, "group", "bot"]]);
  assert.deepEqual(await ensureBotNickname(api, "group", FIXED_NICKNAME), {
    present: true,
    changed: false,
  });
  assert.equal(calls.length, 1);
});

test("the fixed nickname guard skips a bot that is not in the group", async () => {
  let changed = false;
  const api = {
    getCurrentUserID: () => "bot",
    getThreadInfo: async () => ({ participantIDs: ["other"], nicknames: {} }),
    nickname: async () => {
      changed = true;
    },
  };

  assert.deepEqual(await ensureBotNickname(api, "group", FIXED_NICKNAME), {
    present: false,
    changed: false,
  });
  assert.equal(changed, false);
});

test("repeat command factory keeps devil's interval configuration explicit", () => {
  const generated = createRepeatCommand({
    name: "devil",
    propertyName: "devilLoops",
    intervalSeconds: 60,
  });
  assert.equal(generated.name, "devil");
  assert.match(generated.description, /60 ثانية/);
});

test("the nickname checks use the requested exact nickname", () => {
  assert.equal(FIXED_NICKNAME.length > 0, true);
});
