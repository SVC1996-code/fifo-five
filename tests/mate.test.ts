import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  PRESETS,
  replay,
  initialState,
  applyMove,
  positionKey,
  legalMoves,
} from "../src/core";
import { proveMate } from "../src/research/mate";
import {
  uniqueDefense,
  expiringThreats,
  expiryLock,
} from "../src/research/mining";
import fixtures from "../fixtures/rule-cases.json";
const get = (moves: number[]) => replay(DEFAULT_RULES, moves).at(-1)!;
const fixture = (i: number) =>
  get(fixtures.cases[i].prefixMoves.map(([r, c]) => r * 6 + c));
const budget = { maxPly: 3, maxNodes: 200000, timeMs: null };
const ageMoves = [0, 14, 2, 35, 12, 30, 13, 32, 15, 6, 16, 8];
describe("有限强制胜：完整总ply、最优防守、预算未知", () => {
  it("普通直接五连", () => {
    const s = get([0, 30, 1, 32, 2, 34, 3, 6]);
    const d = proveMate(s, { ...budget, maxPly: 1 });
    expect(d.result).toBe("forced-win");
    expect(d.distance).toBe(1);
    expect(d.bestMove).toBe(4);
  });
  it("普通唯一一步防守", () => {
    const s = get([0, 30, 2, 31, 6, 32, 8, 33]);
    expect(uniqueDefense(s)?.bestMove).toBe(34);
    expect(uniqueDefense(s)?.unique).toBe(true);
    expect(proveMate(s, { ...budget, attacker: "O", maxPly: 2 }).result).toBe(
      "not-found",
    );
  });
  it("真正win-in-3须穷尽对手防守", () => {
    const s = get([13, 0, 14, 2, 15, 30]);
    expect(proveMate(s, { ...budget, maxPly: 1 }).result).toBe("not-found");
    const d = proveMate(s, budget);
    expect(d.result).toBe("forced-win");
    expect(d.distance).toBe(3);
  });
  it("win-in-5/7：独立3×3永久棋叉杀", () => {
    const s = replay(PRESETS.at(-1)!.rules, [0, 1]).at(-1)!;
    expect(proveMate(s, budget).result).toBe("not-found");
    const d = proveMate(s, { ...budget, maxPly: 5 });
    expect(d.result).toBe("forced-win");
    expect(d.distance).toBe(5);
    expect(proveMate(s, { ...budget, maxPly: 7 }).result).toBe("forced-win");
  });
  it("到期锁：X无法在1ply取胜，O在接下来2总ply必胜", () => {
    const s = fixture(1);
    expect(proveMate(s, { ...budget, maxPly: 1 }).result).toBe("not-found");
    const d = proveMate(s, { ...budget, attacker: "O", maxPly: 2 });
    expect(d.result).toBe("forced-win");
    expect(d.distance).toBe(2);
    expect(expiryLock(s)?.proof.result).toBe("forced-win");
  });
  it("当前攻击方可利用对方下一回合到期防守棋强制win-in-3", () => {
    const s = get(ageMoves);
    expect(proveMate(s, { ...budget, maxPly: 1 }).result).toBe("not-found");
    expect(proveMate(s, budget).result).toBe("forced-win");
  });
  it("相同棋盘但不同O棋龄导致不同结论，均从合法棋谱重放", () => {
    const a = get(ageMoves),
      b = get([0, 35, 2, 14, 12, 30, 13, 32, 15, 6, 16, 8]);
    expect([...a.queues.O].sort()).toEqual([...b.queues.O].sort());
    expect(proveMate(a, budget).result).toBe("forced-win");
    expect(proveMate(b, budget).result).toBe("not-found");
  });
  it("本方关键老棋同时过期，伪四连不是一手杀", () => {
    expect(proveMate(fixture(0), { ...budget, maxPly: 1 }).result).toBe(
      "not-found",
    );
    expect(expiringThreats(fixture(0)).some((t) => t.move === 16)).toBe(true);
  });
  it("对方进攻棋自身过期，没有表面到期锁必杀", () => {
    expect(
      proveMate(fixture(2), { ...budget, attacker: "O", maxPly: 2 }).result,
    ).toBe("not-found");
    expect(expiryLock(fixture(2))?.proof.result).toBe("not-found");
  });
  it("真实三次重复终局阻止继续搜索", () => {
    let s = initialState({
      ...DEFAULT_RULES,
      boardSize: 3,
      winLength: 3,
      retention: { kind: "fifo", maxStones: 3 },
    });
    const cycle = [0, 2, 1, 3, 5, 7, 6, 8];
    for (let i = 0; i < 40 && !s.result; i++)
      s = applyMove(s, cycle[i % 8]).state;
    expect(s.result).toEqual({ kind: "draw", reason: "repetition" });
    expect(proveMate(s, { ...budget, maxPly: 7 }).result).toBe("not-found");
  });
  it("重复上下文可让所有进攻分支和棋，不按棋盤分值复用", () => {
    const s = get([13, 0, 14, 2, 15, 30]);
    const counts = { ...s.counts };
    for (const m of legalMoves(s))
      counts[positionKey(applyMove(s, m).state)] = 2;
    expect(proveMate({ ...s, counts }, budget).result).toBe("not-found");
    expect(proveMate(s, budget).result).toBe("forced-win");
  });
  it("预算不足只能unknown，不算not-found；非法参数拒绝", () => {
    const s = get(ageMoves);
    for (const b of [
      { ...budget, maxNodes: 0 },
      { ...budget, timeMs: 0 },
      { ...budget, maxNodes: 1 },
    ])
      expect(proveMate(s, b).result).toBe("unknown");
    expect(() => proveMate(s, { ...budget, maxPly: 8 })).toThrow();
    expect(proveMate(s, budget).nodes).toBeLessThanOrEqual(budget.maxNodes);
  });
});
