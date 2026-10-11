import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { open, mkdir, readFile, rename, unlink, stat } from "node:fs/promises";
import path from "node:path";

export const SESSION_LOCK_FILENAME = ".diablos-session.lock";
const HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_LOCK_AGE_MS = 60_000;

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function lockInUseMessage(owner, sameHost) {
  if (sameHost && Number.isSafeInteger(owner?.pid)) {
    return `Another Diablos process is already running with PID ${owner.pid}. Stop it before starting another bot.`;
  }
  return "A Diablos session lock is active or still starting on another host. Keep one bot replica; an abandoned lock expires after one minute without a heartbeat.";
}

export async function createSessionLock({
  directory,
  lockName = SESSION_LOCK_FILENAME,
  pid = process.pid,
  host = hostname(),
} = {}) {
  if (!directory) throw new Error("A session-lock directory is required.");
  await mkdir(directory, { recursive: true });

  const lockPath = path.join(directory, lockName);
  const token = randomUUID();
  let handle;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(
        JSON.stringify({ pid, hostname: host, token, startedAt: new Date().toISOString() }),
        "utf8",
      );
      await handle.sync();
      break;
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
        await unlink(lockPath).catch(() => {});
        throw error;
      }
      if (error?.code !== "EEXIST") throw error;

      let current;
      let lockStat;
      try {
        const [contents, fileStat] = await Promise.all([
          readFile(lockPath, "utf8"),
          stat(lockPath),
        ]);
        current = JSON.parse(contents);
        lockStat = fileStat;
      } catch (readError) {
        if (readError?.code === "ENOENT") continue;
        if (readError instanceof SyntaxError) {
          try {
            lockStat = await stat(lockPath);
          } catch (statError) {
            if (statError?.code === "ENOENT") continue;
            throw statError;
          }
          current = null;
        } else {
          throw readError;
        }
      }

      const sameHost = current?.hostname === host;
      if (sameHost && processIsAlive(current?.pid)) {
        throw new Error(lockInUseMessage(current, true));
      }

      const staleAgeMs = Date.now() - lockStat.mtimeMs;
      const canReclaim =
        (sameHost && !processIsAlive(current?.pid)) ||
        staleAgeMs >= STALE_LOCK_AGE_MS;
      if (!canReclaim) {
        throw new Error(lockInUseMessage(current, sameHost));
      }

      const stalePath = `${lockPath}.stale-${token}-${attempt}`;
      try {
        await rename(lockPath, stalePath);
      } catch (renameError) {
        if (renameError?.code === "ENOENT") continue;
        throw renameError;
      }
      await unlink(stalePath).catch((unlinkError) => {
        if (unlinkError?.code !== "ENOENT") throw unlinkError;
      });
    }
  }

  if (!handle) {
    throw new Error("Could not acquire the Diablos session lock after several attempts.");
  }

  let released = false;
  const heartbeat = setInterval(() => {
    const now = new Date();
    void handle.utimes(now, now).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  return {
    async release() {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      try {
        const [contents, lockStat, ownedStat] = await Promise.all([
          readFile(lockPath, "utf8"),
          stat(lockPath),
          handle.stat(),
        ]);
        const owner = JSON.parse(contents);
        if (
          owner?.token === token &&
          lockStat.dev === ownedStat.dev &&
          lockStat.ino === ownedStat.ino
        ) {
          await unlink(lockPath);
        }
      } catch (error) {
        if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) {
          await handle.close().catch(() => {});
          throw error;
        }
      } finally {
        await handle.close().catch(() => {});
      }
    },
  };
}
