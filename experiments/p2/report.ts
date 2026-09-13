import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { summarize } from "./summary";
import { replay } from "../../src/core";
import type { Player, Result, Rules } from "../../src/core";
interface Decision {
  ply: number;
  player: Player;
  move: number | null;
  score: number | null;
  pv: number[];
  depth: number;
  nodes: number;
  tacticalNodes: number;
  budget: unknown;
}
interface Game {
  id: string;
  pair: string[];
  trajectoryHash: string;
  result: Result | { kind: "cutoff" };
  record: { schemaVersion: 1; rules: Rules; moves: number[] };
  players: { X: { name: string }; O: { name: string } };
  decisions: Decision[];
}
interface Strength {
  complete: boolean;
  games: Game[];
  mistakes: unknown[];
  stopReason?: string;
}
const load = (name: string) =>
  JSON.parse(readFileSync(`experiments/results/${name}.json`, "utf8"));
const before: Strength = load("strength-baseline"),
  after: Strength = load("strength-current");
if (!after.complete)
  throw Error(
    "Current strength experiment not complete; refusing final report",
  );
for (const g of [...before.games, ...after.games]) {
  const state = replay(g.record.rules, g.record.moves).at(-1)!;
  if (
    JSON.stringify(state.result ?? { kind: "cutoff" }) !==
    JSON.stringify(g.result)
  )
    throw Error(`Invalid replay ${g.id}`);
}
const comparison = before.games.map((a) => {
  const b = after.games.find((b) => b.id === a.id);
  if (!b) throw Error("Missing paired result");
  const project = (d: Decision) => ({
    ply: d.ply,
    player: d.player,
    move: d.move,
    score: d.score,
    pv: d.pv,
    depth: d.depth,
    nodes: d.nodes,
    tacticalNodes: d.tacticalNodes,
    budget: d.budget,
  });
  return {
    id: a.id,
    sameTrajectory: a.trajectoryHash === b.trajectoryHash,
    sameDecisions:
      JSON.stringify(a.decisions.map(project)) ===
      JSON.stringify(b.decisions.map(project)),
  };
});
const pairs = [
  ["normal", "tactical"],
  ["hard", "normal"],
];
const report = {
  generatedAt: new Date().toISOString(),
  completedExecutions: before.games.length + after.games.length,
  globalUniqueTrajectories: new Set(
    [...before.games, ...after.games].map((g) => g.trajectoryHash),
  ).size,
  current: {
    complete: after.complete,
    completed: after.games.length,
    uniqueTrajectories: new Set(after.games.map((g) => g.trajectoryHash)).size,
    summaries: pairs.map((pair) => ({
      pair,
      ...summarize(
        after.games.filter((g) => g.pair.join("/") === pair.join("/")),
        pair[0],
      ),
    })),
  },
  baseline: {
    completed: before.games.length,
    stopReason: before.stopReason ?? null,
  },
  pairedBeforeAfter: comparison,
  tacticalAudit: {
    beforeMistakes: before.mistakes.length,
    afterMistakes: after.mistakes.length,
    scope:
      "Generated moves only: stable one-ply wins and one-ply safe replies. No full multi-ply oracle.",
  },
  rawHashes: Object.fromEntries(
    [
      "strength-baseline",
      "strength-current",
      "timing-baseline",
      "timing-current",
    ].map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(`experiments/results/${name}.json`))
        .digest("hex"),
    ]),
  ),
  note: "Exact trajectory duplicates are not additional independent samples. Distinct trajectories and role-swapped openings are correlated; these are pilot results, not fairness/solving evidence. Conflicting agent attribution for duplicate traces is counted separately.",
};
writeFileSync(
  "experiments/results/p2-analysis.json",
  JSON.stringify(report, null, 2),
);
writeFileSync(
  "experiments/results/tactical-findings.json",
  JSON.stringify(
    {
      scope: report.tacticalAudit.scope,
      mistakes: [...before.mistakes, ...after.mistakes],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(report, null, 2));
