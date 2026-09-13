import { describe, expect, it } from "vitest";
import {
  decodeSave,
  readSave,
  writeSave,
  SAVE_KEY,
  type SaveFile,
} from "../src/storage";
import { DEFAULT_RULES, replay } from "../src/core";
const save: SaveFile = {
  saveVersion: 1,
  record: { schemaVersion: 1, rules: DEFAULT_RULES, moves: [0, 7] },
  settings: { mode: "人机", human: "X", difficulty: "正常", age: true },
};
describe("自动存档", () => {
  it("只依赖合法历史，恢复完整上下文", () => {
    const restored = decodeSave(
      JSON.stringify({ ...save, board: ["fake"], winner: "O" }),
    );
    expect(replay(restored.record.rules, restored.record.moves)).toEqual(
      replay(DEFAULT_RULES, [0, 7]),
    );
    expect(restored.settings).toEqual(save.settings);
  });
  it.each([
    "bad",
    "null",
    JSON.stringify({ ...save, saveVersion: 2 }),
    JSON.stringify({ ...save, record: { ...save.record, moves: [0, 0] } }),
    JSON.stringify({
      ...save,
      settings: { ...save.settings, difficulty: "__proto__" },
    }),
    JSON.stringify({ ...save, settings: { ...save.settings, age: 1 } }),
  ])("拒绝坏存档 %s", (text) => expect(() => decodeSave(text)).toThrow());
  it("拒绝过大存档", () =>
    expect(() => decodeSave(" ".repeat(1000001))).toThrow("1 MB"));
  it("读取缺失存档不创建内容", () => {
    expect(
      readSave(() => ({
        getItem: () => null,
        setItem: () => {
          throw Error("不应写入");
        },
      })),
    ).toEqual({ saved: null, error: "" });
  });
  it("存储不可用、损坏与配额失败可理解且保留原文", () => {
    let value = "broken";
    const storage = {
      getItem: () => value,
      setItem: () => {
        throw Error("QuotaExceededError");
      },
    };
    expect(readSave(() => storage).error).toContain("损坏");
    expect(writeSave(() => storage, save)).toContain("请导出棋谱");
    expect(value).toBe("broken");
    expect(
      readSave(() => {
        throw Error("SecurityError");
      }).error,
    ).toContain("SecurityError");
    value = "";
  });
  it("写入/读取往返仅保存规则棋谱设置", () => {
    let text = "";
    const storage = {
      getItem: (key: string) => (key === SAVE_KEY ? text : null),
      setItem: (_key: string, v: string) => {
        text = v;
      },
    };
    expect(writeSave(() => storage, save)).toBe("");
    expect(readSave(() => storage).saved).toEqual(save);
    expect(text).not.toContain("queues");
  });
});
