import { expect, it } from "vitest";
import { summarize } from "../experiments/p2/summary";
it("重复确定性棋谱不重复计样；互换角色后归因冲突明确标注", () => {
  const game = {
    trajectoryHash: "same",
    result: { kind: "win" as const, winner: "X" as const, line: [] },
    players: { X: { name: "a" }, O: { name: "b" } },
  };
  expect(summarize([game, game], "a").deduplicated.agentAWin).toBe(1);
  const summary = summarize(
    [game, { ...game, players: { X: { name: "b" }, O: { name: "a" } } }],
    "a",
  );
  expect(summary.completed).toBe(2);
  expect(summary.uniqueTrajectories).toBe(1);
  expect(summary.deduplicated["ambiguous-role-assignment"]).toBe(1);
  expect(summary.deduplicated.agentAWin).toBe(0);
});
