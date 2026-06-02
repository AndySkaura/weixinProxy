import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function defaultState() {
  return {
    baseUrl: "",
    token: "",
    accountId: "",
    userId: "",
    syncBuf: "",
    contextTokens: {},
    sessions: {},
  };
}

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return defaultState();
      }
      throw error;
    }
  }

  async save(state) {
    const normalized = normalizeState(state);
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(tempPath, this.filePath);
  }

  async patch(updater) {
    const state = await this.load();
    const next = await updater(state);
    await this.save(next || state);
    return next || state;
  }
}

export function normalizeState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    baseUrl: stringValue(state.baseUrl),
    token: stringValue(state.token),
    accountId: stringValue(state.accountId),
    userId: stringValue(state.userId),
    syncBuf: stringValue(state.syncBuf),
    contextTokens: objectValue(state.contextTokens),
    sessions: objectValue(state.sessions),
  };
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}
