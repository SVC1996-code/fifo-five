import { expect, it } from "vitest";
import { DEFAULT_RULES, replay, applyMove, positionKey } from "../src/core";
import {
  transformCell,
  transformMoves,
  canonicalPosition,
  canonicalTrajectory,
  firstMoveOrbits,
} from "../src/research/symmetry";
it("6×6首着恰有6个D4轨道，覆盖36格不重叠", () => {
  const orbits = firstMoveOrbits(6);
  expect(orbits).toHaveLength(6);
  expect(new Set(orbits.flatMap((o) => o.cells)).size).toBe(36);
  expect(orbits.map((o) => o.cells.length)).toEqual([4, 8, 8, 4, 8, 4]);
});
it("变换保持队列年龄、合法行动、终局与规范键；不用于历史TT", () => {
  const moves = [0, 14, 2, 35, 12, 30, 13, 32, 15, 6, 16, 8];
  const s = replay(DEFAULT_RULES, moves).at(-1)!;
  for (let t = 0; t < 8; t++) {
    const ms = transformMoves(moves, 6, t),
      other = replay(DEFAULT_RULES, ms).at(-1)!;
    expect(canonicalPosition(other)).toBe(canonicalPosition(s));
    expect(canonicalTrajectory(DEFAULT_RULES, ms)).toBe(
      canonicalTrajectory(DEFAULT_RULES, moves),
    );
    const a = applyMove(s, 1).state,
      b = applyMove(other, transformCell(1, 6, t)).state;
    expect(b.queues.X).toEqual(transformMoves(a.queues.X, 6, t));
    expect(canonicalPosition(a)).toBe(canonicalPosition(b));
    expect(b.result?.kind).toBe(a.result?.kind);
  }
  expect(
    positionKey({
      ...s,
      queues: { ...s.queues, X: [...s.queues.X].reverse() },
    }),
  ).not.toBe(positionKey(s));
});
