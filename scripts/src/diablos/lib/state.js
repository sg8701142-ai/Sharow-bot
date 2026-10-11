import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));
const configuredDataDirectory =
  process.env.DIABLOS_DATA_DIR?.trim() ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
const storageDirectory = configuredDataDirectory
  ? path.resolve(configuredDataDirectory)
  : dataDirectory;

function normalizeDeveloperId(value) {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) ? id : "";
}

async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export async function createStateStore(
  initialPrefix = "!",
  initialDeveloperId = "",
  directory = storageDirectory,
) {
  const stateFile = path.join(directory, "state.json");
  let state;
  try {
    state = JSON.parse(await readFile(stateFile, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error(`Unable to read bot settings: ${error.message}`);
    }
    state = { prefixes: {}, knownThreads: [] };
  }

  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Bot settings file has an invalid format.");
  }
  if (!state.prefixes || typeof state.prefixes !== "object") {
    state.prefixes = {};
  }
  if (!Array.isArray(state.knownThreads)) state.knownThreads = [];
  state.knownThreads = [
    ...new Set(
      state.knownThreads
        .filter((threadId) => typeof threadId === "string" || typeof threadId === "number")
        .map((threadId) => String(threadId).trim())
        .filter(Boolean),
    ),
  ];
  const developerIds = new Set(
    (Array.isArray(state.developers) ? state.developers : [])
      .map(normalizeDeveloperId)
      .filter(Boolean),
  );
  const configuredDeveloperId = normalizeDeveloperId(initialDeveloperId);
  if (configuredDeveloperId) developerIds.add(configuredDeveloperId);
  state.developers = [...developerIds];

  return {
    getPrefix(threadId) {
      return state.prefixes[threadId] || initialPrefix;
    },
    async setPrefix(threadId, prefix) {
      state.prefixes[threadId] = prefix;
      await writeJsonAtomically(stateFile, state);
    },
    getKnownThreads() {
      return [...state.knownThreads];
    },
    getDeveloperIds() {
      return [...developerIds];
    },
    isDeveloper(userId) {
      const id = normalizeDeveloperId(userId);
      return Boolean(id && developerIds.has(id));
    },
    async addDeveloper(userId) {
      const id = normalizeDeveloperId(userId);
      if (!id) throw new Error("معرّف المطوّر غير صالح.");
      if (developerIds.has(id)) return false;
      const nextDeveloperIds = [...developerIds, id];
      await writeJsonAtomically(stateFile, {
        ...state,
        developers: nextDeveloperIds,
      });
      state.developers = nextDeveloperIds;
      developerIds.add(id);
      return true;
    },
    async removeDeveloper(userId) {
      const id = normalizeDeveloperId(userId);
      if (!id) throw new Error("معرّف المطوّر غير صالح.");
      if (id === configuredDeveloperId) {
        throw new Error("لا يمكن حذف المطوّر الأساسي.");
      }
      if (!developerIds.has(id)) return false;
      const nextDeveloperIds = [...developerIds].filter(
        (developerId) => developerId !== id,
      );
      await writeJsonAtomically(stateFile, {
        ...state,
        developers: nextDeveloperIds,
      });
      state.developers = nextDeveloperIds;
      developerIds.delete(id);
      return true;
    },
    async rememberThread(threadId) {
      const id = String(threadId ?? "").trim();
      if (!id || state.knownThreads.includes(id)) return;
      state.knownThreads.push(id);
      await writeJsonAtomically(stateFile, state);
    },
  };
}

export { storageDirectory as dataDirectory, writeJsonAtomically };
