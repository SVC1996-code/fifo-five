import { expect, it } from "vitest";
import { RULES, openingSet } from "../experiments/p3/config";
import {
  replay,
  applyMove,
  other,
  legalMoves,
  type State,
  type Player,
} from "../src/core";
import { proveMate } from "../src/research/mate";
import { expiringThreats, expirySwing } from "../src/research/mining";
import fixtures from "../fixtures/rule-cases.json";
it.each(Object.keys(RULES))(
  "%s 开局集20个，合法、无立即杀、覆盖已经删除中盘、避免D4重复",
  (key) => {
    const rules = RULES[key],
      openings = openingSet(rules);
    expect(openings).toHaveLength(20);
    expect(new Set(openings.map((o) => o.canonical)).size).toBe(20);
    expect(openings.some((o) => o.deletions > 0)).toBe(true);
    expect(openings.some((o) => o.phase === "age-pressure")).toBe(true);
    for (const o of openings) {
      const s = replay(rules, o.moves).at(-1)!;
      expect(s.result).toBeNull();
      expect(
        proveMate(s, { maxPly: 1, maxNodes: 10000, timeMs: null }).result,
      ).toBe("not-found");
      expect(
        proveMate(s, {
          attacker: other(s.turn),
          maxPly: 2,
          maxNodes: 10000,
          timeMs: null,
        }).result,
      ).toBe("not-found");
    }
  },
);
it("expiry swing是可复算集合变化，不设置分数阈值，也不改变输入", () => {
  const moves = fixtures.cases[0].prefixMoves.map(([r, c]) => r * 6 + c),
    s = replay(RULES.C, moves).at(-1)!,
    before = JSON.stringify(s);
  expect(expiringThreats(s).length).toBeGreaterThan(0);
  const swing = expirySwing(s, 16);
  expect(swing?.removed).toBe(12);
  expect(swing?.changes.length).toBeGreaterThan(0);
  expect(JSON.stringify(s)).toBe(before);
});
function oracle(s: State, depth: number, p: Player): boolean {
  if (s.result) return s.result.kind === "win" && s.result.winner === p;
  if (!depth) return false;
  const values = legalMoves(s).map((m) =>
    oracle(applyMove(s, m).state, depth - 1, p),
  );
  return s.turn === p
    ? values.some(Boolean)
    : values.length > 0 && values.every(Boolean);
}
it("AND/OR与独立全宽布尔oracle一致，涵盖不同攻击方和限定深度", () => {
  const rules = {
    ...RULES.C,
    boardSize: 3,
    winLength: 3,
    retention: { kind: "permanent" as const },
  };
  for (const moves of [[], [0, 1], [0, 4, 1], [0, 3, 1, 4]])
    for (const attacker of ["X", "O"] as Player[])
      for (const maxPly of [1, 3, 5]) {
        const s = replay(rules, moves).at(-1)!,
          d = proveMate(s, {
            attacker,
            maxPly,
            maxNodes: 500000,
            timeMs: null,
          });
        expect(d.result).toBe(
          oracle(s, maxPly, attacker) ? "forced-win" : "not-found",
        );
      }
}, 15000);
