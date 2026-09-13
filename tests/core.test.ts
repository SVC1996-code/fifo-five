import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/rule-cases.json";
import {
  DEFAULT_RULES,
  PRESETS,
  applyMove,
  exportRecord,
  importRecord,
  initialState,
  legalMoves,
  positionKey,
  replay,
  undoTarget,
  validateRules,
  winningLine,
  type State,
} from "../src/core";
const fixture = (i: number) =>
  replay(
    DEFAULT_RULES,
    fixtures.cases[i].prefixMoves.map(([r, c]) => r * 6 + c),
  ).at(-1)!;
const classic = PRESETS.at(-1)!.rules;
const cycleRules = validateRules({
  ...DEFAULT_RULES,
  boardSize: 3,
  winLength: 3,
  retention: { kind: "fifo", maxStones: 3 },
});
const cycle = [0, 2, 1, 3, 5, 7, 6, 8];
describe("配置与不可变规则推进", () => {
  it("默认与预设", () => {
    expect(DEFAULT_RULES).toMatchObject({
      boardSize: 6,
      winLength: 5,
      retention: { kind: "fifo", maxStones: 6 },
    });
    expect(PRESETS).toHaveLength(8);
    PRESETS.forEach((p) => expect(validateRules(p.rules)).toEqual(p.rules));
  });
  it.each([
    { boardSize: 2 },
    { boardSize: 10 },
    { winLength: 7 },
    { winLength: 2 },
    { rulesVersion: "2" },
    { retention: { kind: "fifo", maxStones: 4 } },
    { retention: { kind: "fifo", maxStones: 37 } },
    { retention: { kind: "fifo", maxStones: 6.5 } },
    { retention: { kind: "wat" } },
    { matchPlyLimit: 0 },
    { repetitionThreshold: 2 },
  ])("拒绝非法配置 %j", (patch) =>
    expect(() => validateRules({ ...DEFAULT_RULES, ...patch })).toThrow(),
  );
  it("规则冻结且初始计数为一", () => {
    const s = initialState();
    expect(s.counts[positionKey(s)]).toBe(1);
    expect(Object.isFrozen(s.rules)).toBe(true);
    expect(Object.isFrozen(s.rules.retention)).toBe(true);
  });
  it("非法行动不修改输入；不能续命", () => {
    const s = fixture(0),
      before = JSON.stringify(s);
    for (const m of [-1, 36, 1.5, NaN, s.queues.X[0]])
      expect(() => applyMove(s, m)).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("未满不删除，满时只删本方队首", () => {
    expect(applyMove(initialState(), 0).event.removed).toBeNull();
    const s = fixture(0),
      before = JSON.stringify(s),
      next = applyMove(s, 16);
    expect(next.event.removed).toBe(12);
    expect(next.state.queues.X).toHaveLength(6);
    expect(next.state.queues.O).toEqual(s.queues.O);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("9×9 高位格不截断", () => {
    const s = applyMove(
      initialState({ ...DEFAULT_RULES, boardSize: 9 }),
      80,
    ).state;
    expect(s.queues.X).toEqual([80]);
    expect(legalMoves(s)).not.toContain(80);
  });
  it("自动合法对局维持队列与格子不变量", () => {
    for (const p of PRESETS) {
      let s = initialState(p.rules);
      for (let i = 0; i < 150 && !s.result; i++) {
        const ms = legalMoves(s);
        s = applyMove(s, ms[(i * 17 + 3) % ms.length]).state;
        const cells = [...s.queues.X, ...s.queues.O];
        expect(new Set(cells).size).toBe(cells.length);
        expect(cells.every((c) => c >= 0 && c < p.rules.boardSize ** 2)).toBe(
          true,
        );
        if (p.rules.retention.kind === "fifo")
          for (const q of Object.values(s.queues))
            expect(q.length).toBeLessThanOrEqual(p.rules.retention.maxStones);
      }
    }
  });
});
describe("判胜方向与附件完整历史", () => {
  it.each([
    [0, 1, 2, 3, 4],
    [0, 6, 12, 18, 24],
    [0, 7, 14, 21, 28],
    [4, 9, 14, 19, 24],
    [0, 1, 2, 3, 4, 5],
  ])("方向/超长 %j", (...cells) => {
    const s = { ...initialState(), queues: { X: cells, O: [] } };
    expect(winningLine(s, "X")).not.toBeNull();
  });
  it("断线与跨行不是连线", () => {
    for (const cells of [
      [0, 1, 3, 4, 5],
      [4, 5, 6, 7, 8],
    ])
      expect(
        winningLine({ ...initialState(), queues: { X: cells, O: [] } }, "X"),
      ).toBeNull();
  });
  it("false-five-after-expiry", () => {
    const { state, event } = applyMove(fixture(0), 16);
    expect(state.result).toBeNull();
    expect(event.removed).toBe(12);
    expect(state.turn).toBe("O");
  });
  it("expiry-lock 全部24点", () => {
    const s = fixture(1);
    expect(legalMoves(s)).toHaveLength(24);
    for (const m of legalMoves(s)) {
      const next = applyMove(s, m).state;
      expect(next.result).toBeNull();
      expect(applyMove(next, 14).state.result).toMatchObject({
        kind: "win",
        winner: "O",
      });
    }
  });
  it("expiry-lock-counterexample", () => {
    const s = applyMove(fixture(2), 1).state;
    const next = applyMove(s, 14);
    expect(next.event.removed).toBe(12);
    expect(next.state.result).toBeNull();
    expect(next.state.turn).toBe("X");
  });
  it("删除线外旧棋后仍赢，胜利优先于步数限制", () => {
    const moves = [0, 30, 12, 32, 13, 34, 14, 6, 15, 8, 2, 10];
    const s = replay({ ...DEFAULT_RULES, matchPlyLimit: 13 }, moves).at(-1)!;
    const next = applyMove(s, 16);
    expect(next.event.removed).toBe(0);
    expect(next.state.result).toMatchObject({ kind: "win", winner: "X" });
    expect(() => applyMove(next.state, 3)).toThrow();
    expect(legalMoves(next.state)).toEqual([]);
  });
  it("永久棋满盘和棋与规则手数限制", () => {
    expect(replay(classic, [0, 1, 2, 4, 3, 5, 7, 6, 8]).at(-1)!.result).toEqual(
      { kind: "draw", reason: "no-moves" },
    );
    expect(
      applyMove(initialState({ ...DEFAULT_RULES, matchPlyLimit: 1 }), 0).state
        .result,
    ).toEqual({ kind: "draw", reason: "ply-limit" });
  });
});
describe("完整局面与历史/存档", () => {
  it("相同占位不同年龄或行动方必须不同；绝对手数不影响键", () => {
    const s = fixture(0);
    expect(positionKey({ ...s, ply: 999 })).toBe(positionKey(s));
    expect(positionKey({ ...s, turn: "O" })).not.toBe(positionKey(s));
    expect(
      positionKey({
        ...s,
        queues: { ...s.queues, X: [...s.queues.X].reverse() },
      }),
    ).not.toBe(positionKey(s));
    expect(
      positionKey({ ...s, rules: { ...s.rules, matchPlyLimit: 200 } }),
    ).not.toBe(positionKey(s));
  });
  it("真实合法循环直到第三次和棋，中间态不计数", () => {
    let s = initialState(cycleRules);
    let repeated: State | null = null;
    const moves: number[] = [];
    for (let i = 0; i < 40 && !s.result; i++) {
      moves.push(cycle[i % cycle.length]);
      s = applyMove(s, moves.at(-1)!).state;
      if (s.counts[positionKey(s)] === 2) {
        expect(s.result).toBeNull();
        repeated = s;
      }
    }
    expect(repeated).not.toBeNull();
    expect(s.result).toEqual({ kind: "draw", reason: "repetition" });
    expect(Math.max(...Object.values(s.counts))).toBe(3);
    expect(Object.values(s.counts).reduce((a, b) => a + b, 0)).toBe(s.ply + 1);
    const imported = importRecord(exportRecord(cycleRules, moves));
    expect(replay(imported.rules, imported.moves).at(-1)).toEqual(s);
    expect(replay(cycleRules, moves.slice(0, -1)).at(-1)!.result).toBeNull();
    expect(initialState(cycleRules).counts).toEqual({
      [positionKey(initialState(cycleRules))]: 1,
    });
  });
  it.each([
    "bad",
    "null",
    "{}",
    '{"schemaVersion":2}',
    '{"schemaVersion":1,"rules":null,"moves":[]}',
  ])("拒绝损坏棋谱 %s", (text) => expect(() => importRecord(text)).toThrow());
  it("拒绝超大、越界、重复、终局后续落子", () => {
    expect(() => importRecord(" ".repeat(1_000_001))).toThrow("1 MB");
    for (const moves of [[36], [0, 0], [0.1]])
      expect(() =>
        importRecord(
          JSON.stringify({ schemaVersion: 1, rules: DEFAULT_RULES, moves }),
        ),
      ).toThrow();
    expect(() =>
      importRecord(
        JSON.stringify({
          schemaVersion: 1,
          rules: classic,
          moves: [0, 3, 1, 4, 2, 8],
        }),
      ),
    ).toThrow("结束");
  });
  it("人机悔棋的五种时机", () => {
    expect(undoTarget(replay(classic, [0]), "X")).toBe(0);
    expect(undoTarget(replay(classic, [0, 3]), "X")).toBe(0);
    expect(undoTarget(replay(classic, [0, 3, 1, 4, 2]), "X")).toBe(4);
    expect(undoTarget(replay(classic, [0, 3, 1, 4, 8, 5]), "X")).toBe(4);
    expect(undoTarget(replay(classic, [0]), "O")).toBe(1);
    expect(undoTarget(replay(classic, [0, 3]), null)).toBe(1);
  });
});
