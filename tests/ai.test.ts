import { describe, expect, it } from "vitest";
import { chooseMove, evaluate, type Algorithm, type Budget } from "../src/ai";
import {
  applyMove,
  DEFAULT_RULES,
  initialState,
  legalMoves,
  other,
  PRESETS,
  replay,
  positionKey,
  type Player,
  type State,
} from "../src/core";
import fixtures from "../fixtures/rule-cases.json";
const budget: Budget = {
  maxNodes: 100000,
  timeMs: null,
  seed: 42,
  maxDepth: 3,
};
const classic = PRESETS.at(-1)!.rules;
function naive(s: State, depth: number, p: Player): number {
  if (s.result || depth === 0) return evaluate(s, p);
  return Math.max(
    ...legalMoves(s).map(
      (m) => -naive(applyMove(s, m).state, depth - 1, other(p)),
    ),
  );
}
function perfect(board: string[], turn: string): number {
  const paths = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const line of paths)
    if (board[line[0]] && line.every((i) => board[i] === board[line[0]]))
      return board[line[0]] === turn ? 1 : -1;
  const empty = board.flatMap((p, i) => (p ? [] : [i]));
  if (!empty.length) return 0;
  return Math.max(
    ...empty.map((i) => {
      const b = [...board];
      b[i] = turn;
      return -perfect(b, turn === "X" ? "O" : "X");
    }),
  );
}
describe("AI 合法性、FIFO 战术与预算", () => {
  it.each(["random", "tactical", "search"] as Algorithm[])(
    "%s 返回合法点或终局 null",
    (algorithm) => {
      for (const preset of PRESETS) {
        const s = initialState(preset.rules);
        expect(legalMoves(s)).toContain(
          chooseMove(s, { ...budget, maxNodes: 20 }, algorithm).move,
        );
      }
      const s = replay(classic, [0, 3, 1, 4, 2]).at(-1)!;
      expect(chooseMove(s, budget, algorithm).move).toBeNull();
    },
  );
  it.each(["tactical", "search"] as Algorithm[])(
    "%s 一手胜优先",
    (algorithm) => {
      const s = replay(classic, [0, 3, 1, 4]).at(-1)!;
      expect(chooseMove(s, budget, algorithm).move).toBe(2);
    },
  );
  it.each(["tactical", "search"] as Algorithm[])(
    "%s 有安全回复就防守",
    (algorithm) => {
      const s = replay(classic, [0, 4, 1]).at(-1)!;
      expect(chooseMove(s, budget, algorithm).move).toBe(2);
    },
  );
  it("到期锁没有安全回复，反例不误判为必杀", () => {
    const f = (i: number) =>
      replay(
        DEFAULT_RULES,
        fixtures.cases[i].prefixMoves.map(([r, c]) => r * 6 + c),
      ).at(-1)!;
    expect(chooseMove(f(1), budget, "tactical").safeMoves).toBeCloseTo(0);
    expect(chooseMove(f(2), budget, "tactical").safeMoves).toBeGreaterThan(0);
    const s = applyMove(f(2), 1).state;
    const d = chooseMove(s, budget, "tactical");
    expect(d.score).not.toBe(1_000_000);
  });
  it("零预算也有合法安全后备，不记未完成深度", () => {
    const s = initialState();
    const d = chooseMove(s, { ...budget, maxNodes: 0 });
    expect(legalMoves(s)).toContain(d.move);
    expect(d.depth).toBeCloseTo(0);
    expect(d.exhausted).toBe(true);
    expect(d.nodes).toBeCloseTo(0);
  });
  it("墙钟截止安全退出", () => {
    const d = chooseMove(initialState(), { ...budget, timeMs: 0 });
    expect(d.exhausted).toBe(true);
    expect(d.depth).toBeCloseTo(0);
  });
  it("固定节点预算和种子结果可复现", () => {
    const a = chooseMove(initialState(), { ...budget, maxNodes: 100 }),
      b = chooseMove(initialState(), { ...budget, maxNodes: 100 });
    expect({ ...a, elapsedMs: 0, tacticalMs: 0, searchMs: 0 }).toEqual({ ...b, elapsedMs: 0, tacticalMs: 0, searchMs: 0 });
  });
});
describe("独立全宽参照", () => {
  it("独立3×3穷举开局为和棋；引擎搜索一致", () => {
    expect(perfect(Array(9).fill(""), "X")).toBeCloseTo(0);
    const d = chooseMove(initialState(classic), {
      ...budget,
      maxNodes: 1_000_000,
      maxDepth: 9,
    });
    expect(d.depth).toBe(9);
    expect(d.score).toBeCloseTo(0);
  }, 30000);
  it("小深度 Alpha-Beta 与朴素搜索一致", () => {
    for (const moves of [[], [0], [0, 4]]) {
      const s = replay(classic, moves).at(-1)!;
      const d = chooseMove(s, budget);
      expect(d.depth).toBe(3);
      expect(d.score).toBe(naive(s, 3, s.turn));
    }
  });
  it("相同局面不同重复上下文不复用分数", () => {
    const a = initialState(classic);
    const counts = { ...a.counts };
    for (const m of legalMoves(a))
      counts[positionKey(applyMove(a, m).state)] = 2;
    const b = { ...a, counts };
    expect(positionKey(a)).toBe(positionKey(b));
    for (const s of [a, b, a]) {
      const d = chooseMove(s, { ...budget, maxDepth: 1 });
      expect(d.score).toBe(naive(s, 1, s.turn));
    }
    expect(chooseMove(b, { ...budget, maxDepth: 1 }).score).toBeCloseTo(0);
    expect(chooseMove(a, { ...budget, maxDepth: 1 }).score).not.toBeCloseTo(0);
  });
  it("同一规则不同剩余手数影响终局", () => {
    const a = initialState({ ...classic, matchPlyLimit: 3 }),
      b = { ...a, ply: 2 };
    expect(positionKey(a)).toBe(positionKey(b));
    for (const s of [a, b])
      expect(chooseMove(s, { ...budget, maxDepth: 1 }).score).toBe(
        naive(s, 1, s.turn),
      );
    expect(chooseMove(b, { ...budget, maxDepth: 1 }).score).toBeCloseTo(0);
  });
});
