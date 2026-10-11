import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { delay } from "./messenger.js";
import { dataDirectory } from "./state.js";

const usesPersistentDataDirectory =
  process.env.DIABLOS_DATA_DIR?.trim() ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
const nikeDirectory = usesPersistentDataDirectory
  ? path.join(dataDirectory, "Nike")
  : fileURLToPath(new URL("../Nike/", import.meta.url));
export const DEFAULT_RESTORE_DELAY_MS = 0;
const DEFAULT_NICKNAME_CHANGE_DELAY_MS = 500;

function backupPath(threadId, directory = nikeDirectory) {
  return path.join(directory, `${threadId}.json`);
}

async function writeSnapshot(threadId, snapshot, directory = nikeDirectory) {
  await mkdir(directory, { recursive: true });
  const filePath = backupPath(threadId, directory);
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

function makeSnapshot(threadId, info, enabled) {
  return {
    threadId,
    enabled,
    groupName: info.threadName ?? "",
    nicknames: Object.fromEntries(
      Object.entries(info.nicknames ?? {}).map(([id, nickname]) => [
        id,
        nickname ?? "",
      ]),
    ),
    savedAt: new Date().toISOString(),
  };
}

function normalizeParticipantId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object") {
    const id =
      value.userID ?? value.userFbId ?? value.user_fb_id ?? value.uid ?? value.id;
    if (id !== undefined && id !== null) return String(id);
  }
  return null;
}

export function createProtection(api, onError = () => {}, options = {}) {
  const {
    directory = nikeDirectory,
    restoreDelayMs = DEFAULT_RESTORE_DELAY_MS,
    nicknameChangeDelayMs = DEFAULT_NICKNAME_CHANGE_DELAY_MS,
    wait = delay,
  } = options;
  const cache = new Map();
  const timers = new Map();
  const runningRestores = new Map();
  const pendingWrites = new Map();
  let resetGeneration = 0;
  let clearingBackups = false;
  let clearPromise = null;

  function getCurrentGeneration() {
    if (clearingBackups) {
      throw new Error("جارٍ حذف نسخ الحماية؛ أعد المحاولة بعد انتهائه.");
    }
    return resetGeneration;
  }

  function isCurrentGeneration(generation) {
    return !clearingBackups && generation === resetGeneration;
  }

  function assertCurrentGeneration(generation) {
    if (!isCurrentGeneration(generation)) {
      throw new Error("تم حذف نسخ الحماية أثناء تنفيذ العملية.");
    }
  }

  async function getSnapshot(threadId, generation = getCurrentGeneration()) {
    assertCurrentGeneration(generation);
    if (cache.has(threadId)) return cache.get(threadId);
    try {
      const contents = await readFile(backupPath(threadId, directory), "utf8");
      if (!isCurrentGeneration(generation)) return null;
      const snapshot = JSON.parse(contents);
      if (
        snapshot?.threadId !== threadId ||
        typeof snapshot.enabled !== "boolean" ||
        typeof snapshot.groupName !== "string" ||
        !snapshot.nicknames ||
        typeof snapshot.nicknames !== "object" ||
        Array.isArray(snapshot.nicknames) ||
        Object.values(snapshot.nicknames).some(
          (nickname) => typeof nickname !== "string",
        )
      ) {
        throw new Error("Invalid protection backup format.");
      }
      cache.set(threadId, snapshot);
      return snapshot;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new Error(`Unable to read protection backup for ${threadId}: ${error.message}`);
    }
  }

  async function save(threadId, snapshot, generation) {
    assertCurrentGeneration(generation);
    const previous = pendingWrites.get(threadId) ?? Promise.resolve();
    const writing = previous
      .catch(() => {})
      .then(async () => {
        assertCurrentGeneration(generation);
        await writeSnapshot(threadId, snapshot, directory);
        assertCurrentGeneration(generation);
        cache.set(threadId, snapshot);
      });
    pendingWrites.set(threadId, writing);
    try {
      await writing;
    } finally {
      if (pendingWrites.get(threadId) === writing) {
        pendingWrites.delete(threadId);
      }
    }
  }

  async function enable(threadId) {
    const generation = getCurrentGeneration();
    const info = await api.getThreadInfo(threadId);
    assertCurrentGeneration(generation);
    const snapshot = makeSnapshot(threadId, info, true);
    const activeRestore = runningRestores.get(threadId);
    if (activeRestore) activeRestore.cancelled = true;
    const timer = timers.get(threadId);
    if (timer) clearTimeout(timer);
    timers.delete(threadId);
    await save(threadId, snapshot, generation);
    return snapshot;
  }

  async function disable(threadId) {
    const generation = getCurrentGeneration();
    const snapshot = await getSnapshot(threadId, generation);
    if (!snapshot) return false;
    assertCurrentGeneration(generation);
    snapshot.enabled = false;
    snapshot.savedAt = new Date().toISOString();
    const activeRestore = runningRestores.get(threadId);
    if (activeRestore) activeRestore.cancelled = true;
    await save(threadId, snapshot, generation);
    const timer = timers.get(threadId);
    if (timer) clearTimeout(timer);
    timers.delete(threadId);
    return true;
  }

  async function refreshFromCurrent(threadId) {
    const generation = getCurrentGeneration();
    const previous = await getSnapshot(threadId, generation);
    const info = await api.getThreadInfo(threadId);
    assertCurrentGeneration(generation);
    const activeRestore = runningRestores.get(threadId);
    if (activeRestore) activeRestore.cancelled = true;
    await save(
      threadId,
      makeSnapshot(threadId, info, previous?.enabled ?? false),
      generation,
    );
  }

  async function restore(threadId) {
    if (clearingBackups || runningRestores.has(threadId)) return;
    const generation = getCurrentGeneration();
    const restoreRun = { cancelled: false, done: null };
    let finishRestore;
    restoreRun.done = new Promise((resolve) => {
      finishRestore = resolve;
    });
    runningRestores.set(threadId, restoreRun);
    const shouldContinue = (snapshot) =>
      !restoreRun.cancelled &&
      isCurrentGeneration(generation) &&
      snapshot.enabled;
    try {
      const snapshot = await getSnapshot(threadId, generation);
      if (!snapshot?.enabled) return;

      const info = await api.getThreadInfo(threadId);
      if (!shouldContinue(snapshot)) return;
      const currentParticipants = new Set(
        (info.participantIDs ?? []).map(normalizeParticipantId).filter(Boolean),
      );

      // Capture first-seen nicknames for new participants; keep the saved
      // values for existing members as the protected baseline.
      for (const participantId of currentParticipants) {
        if (!(participantId in snapshot.nicknames)) {
          snapshot.nicknames[participantId] = info.nicknames?.[participantId] ?? "";
        }
      }
      if (!shouldContinue(snapshot)) return;
      await save(threadId, snapshot, generation);

      if ((info.threadName ?? "") !== snapshot.groupName) {
        if (!shouldContinue(snapshot)) return;
        try {
          await api.gcname(snapshot.groupName, threadId);
        } catch (error) {
          onError(`تعذر استعادة اسم المجموعة ${threadId}: ${error.message}`);
        }
        if (!shouldContinue(snapshot)) return;
        await wait(nicknameChangeDelayMs);
      }

      for (const [participantId, savedNickname] of Object.entries(snapshot.nicknames)) {
        if (!currentParticipants.has(participantId)) continue;
        if (!shouldContinue(snapshot)) return;
        const currentNickname = info.nicknames?.[participantId] ?? "";
        if (currentNickname !== savedNickname) {
          try {
            await api.nickname(savedNickname, threadId, participantId);
          } catch (error) {
            onError(`تعذر استعادة كنية عضو في المجموعة ${threadId}: ${error.message}`);
          }
          if (!shouldContinue(snapshot)) return;
          await wait(nicknameChangeDelayMs);
        }
      }
    } catch (error) {
      if (!restoreRun.cancelled) {
        onError(`تعذر استعادة حماية المجموعة ${threadId}: ${error.message}`);
      }
    } finally {
      if (runningRestores.get(threadId) === restoreRun) {
        runningRestores.delete(threadId);
      }
      finishRestore();
    }
  }

  async function scheduleRestore(threadId) {
    const generation = getCurrentGeneration();
    const snapshot = await getSnapshot(threadId, generation);
    if (!snapshot?.enabled) return;
    assertCurrentGeneration(generation);
    const existing = timers.get(threadId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timers.delete(threadId);
      void restore(threadId);
    }, restoreDelayMs);
    timers.set(threadId, timer);
  }

  async function status(threadId) {
    const generation = getCurrentGeneration();
    const snapshot = await getSnapshot(threadId, generation);
    return {
      enabled: snapshot?.enabled ?? false,
      savedAt: snapshot?.savedAt ?? null,
    };
  }

  async function resumeSavedProtections() {
    const generation = getCurrentGeneration();
    let files;
    try {
      files = await readdir(directory);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const file of files.filter((name) => /^\d+\.json$/.test(name))) {
      if (!isCurrentGeneration(generation)) return;
      await scheduleRestore(file.slice(0, -5));
    }
  }

  async function clearAllBackups() {
    if (clearPromise) return clearPromise;

    clearingBackups = true;
    resetGeneration += 1;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const restoreRun of runningRestores.values()) {
      restoreRun.cancelled = true;
    }

    const clearing = (async () => {
      try {
        await Promise.allSettled(
          [...runningRestores.values()].map((restoreRun) => restoreRun.done),
        );
        await Promise.allSettled([...pendingWrites.values()]);

        let files;
        try {
          files = await readdir(directory, { withFileTypes: true });
        } catch (error) {
          if (error?.code === "ENOENT") return { deleted: 0, failed: 0 };
          throw error;
        }

        let deleted = 0;
        let failed = 0;
        const snapshots = files.filter(
          (file) =>
            file.isFile() && /^\d+\.json(?:\.tmp)?$/.test(file.name),
        );
        await Promise.all(
          snapshots.map(async (file) => {
            try {
              await unlink(path.join(directory, file.name));
              deleted += 1;
            } catch (error) {
              if (error?.code !== "ENOENT") failed += 1;
            }
          }),
        );
        return { deleted, failed };
      } finally {
        cache.clear();
      }
    })();

    clearPromise = clearing.finally(() => {
      clearingBackups = false;
      clearPromise = null;
    });
    return clearPromise;
  }

  return {
    enable,
    disable,
    refreshFromCurrent,
    scheduleRestore,
    status,
    resumeSavedProtections,
    clearAllBackups,
  };
}
