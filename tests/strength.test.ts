import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { importRecord, replay } from "../src/core";
interface Row {
  id: string;
  trajectoryHash: string;
  record: unknown;
  result: unknown;
  decisions: Record<string, unknown>[];
}
interface File {
  complete: boolean;
  games: Row[];
  mistakes: unknown[];
}
const read = (name: string): File =>
  JSON.parse(readFileSync(`experiments/results/strength-${name}.json`, "utf8"));
it("P2 真实对照的完整棋谱全部合法，完成局数及独特轨迹可复核", () => {
  const current = read("current");
  expect(current.complete).toBe(true);
  expect(current.games).toHaveLength(12);
  for (const file of [current, read("baseline")])
    for (const g of file.games) {
      const r = importRecord(JSON.stringify(g.record));
      expect(
        replay(r.rules, r.moves).at(-1)!.result ?? { kind: "cutoff" },
      ).toEqual(g.result);
    }
  expect(current.mistakes).toEqual([]);
});
it("排序缓存修改前后的六局共同测试集，逐手选择与搜索结果相同", () => {
  const before = read("baseline"),
    after = read("current");
  expect(before.games).toHaveLength(6);
  const decision = (d: Record<string, unknown>) =>
    Object.fromEntries(
      [
        "ply",
        "player",
        "move",
        "score",
        "pv",
        "depth",
        "nodes",
        "tacticalNodes",
        "budget",
      ].map((k) => [k, d[k]]),
    );
  for (const a of before.games) {
    const b = after.games.find((g) => g.id === a.id)!;
    expect(b.trajectoryHash).toBe(a.trajectoryHash);
    expect(b.decisions.map(decision)).toEqual(a.decisions.map(decision));
  }
});
