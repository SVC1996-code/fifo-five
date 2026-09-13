import {
  importRecord,
  MAX_RECORD_BYTES,
  type RecordFile,
  type Player,
} from "./core";
import { DIFFICULTIES } from "./ai";
export const SAVE_KEY = "fifo-five.autosave.v1";
export interface Settings {
  mode: "人机" | "同机双人";
  human: Player;
  difficulty: string;
  age: boolean;
}
export interface SaveFile {
  saveVersion: 1;
  record: RecordFile;
  settings: Settings;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function decodeSave(text: string): SaveFile {
  if (new TextEncoder().encode(text).length > MAX_RECORD_BYTES)
    throw Error("自动存档超过 1 MB 限制");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Error("自动存档损坏：不是有效 JSON");
  }
  if (!raw || typeof raw !== "object") throw Error("自动存档格式不正确");
  const s = raw as SaveFile;
  if (s.saveVersion !== 1) throw Error("自动存档版本不兼容");
  const record = importRecord(JSON.stringify(s.record));
  const c = s.settings;
  if (
    !c ||
    !["人机", "同机双人"].includes(c.mode) ||
    !["X", "O"].includes(c.human) ||
    typeof c.difficulty !== "string" ||
    !Object.hasOwn(DIFFICULTIES, c.difficulty) ||
    typeof c.age !== "boolean"
  )
    throw Error("自动存档的对战设置不合法");
  return {
    saveVersion: 1,
    record,
    settings: {
      mode: c.mode,
      human: c.human,
      difficulty: c.difficulty,
      age: c.age,
    },
  };
}
export function readSave(storage: () => StoragePort): {
  saved: SaveFile | null;
  error: string;
} {
  try {
    const text = storage().getItem(SAVE_KEY);
    return { saved: text === null ? null : decodeSave(text), error: "" };
  } catch (e) {
    return { saved: null, error: `无法恢复上次对局：${(e as Error).message}` };
  }
}
export function writeSave(storage: () => StoragePort, save: SaveFile): string {
  try {
    const text = JSON.stringify(save);
    decodeSave(text);
    storage().setItem(SAVE_KEY, text);
    return "";
  } catch (e) {
    return `自动存档失败，请导出棋谱备份：${(e as Error).message}`;
  }
}
