import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createSessionLock,
  SESSION_LOCK_FILENAME,
} from "../src/diablos/lib/session-lock.js";

async function makeDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diablos-session-lock-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("only one process can own a session lock at a time", async (t) => {
  const directory = await makeDirectory(t);
  const first = await createSessionLock({ directory });

  await assert.rejects(
    createSessionLock({ directory }),
    /already running/,
  );

  await first.release();
  await assert.rejects(
    readFile(path.join(directory, SESSION_LOCK_FILENAME)),
    { code: "ENOENT" },
  );

  const second = await createSessionLock({ directory });
  await second.release();
});

test("a stale lock left by a stopped process can be reclaimed", async (t) => {
  const directory = await makeDirectory(t);
  await writeFile(
    path.join(directory, SESSION_LOCK_FILENAME),
    JSON.stringify({
      pid: 99_999_999,
      hostname: os.hostname(),
      token: "stale-test-lock",
    }),
  );

  const lock = await createSessionLock({ directory });
  await lock.release();
  await assert.rejects(
    readFile(path.join(directory, SESSION_LOCK_FILENAME)),
    { code: "ENOENT" },
  );
});

test("a fresh lock from another host blocks startup until its heartbeat expires", async (t) => {
  const directory = await makeDirectory(t);
  const lockPath = path.join(directory, SESSION_LOCK_FILENAME);
  await writeFile(
    lockPath,
    JSON.stringify({
      pid: 99_999_999,
      hostname: "previous-host",
      token: "previous-host-lock",
    }),
  );

  await assert.rejects(
    createSessionLock({ directory }),
    /another host/,
  );

  const staleTime = new Date(Date.now() - 120_000);
  await utimes(lockPath, staleTime, staleTime);
  const lock = await createSessionLock({ directory });
  await lock.release();
});
