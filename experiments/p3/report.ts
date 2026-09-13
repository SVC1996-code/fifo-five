import { readFileSync, writeFileSync } from "node:fs";
import { JOBS, AGENTS, SETTINGS, RULES } from "./config";
import { summarize as agentSummary } from "../p2/summary";
import { metrics } from "./metrics";
import { type Batch } from "./runner";
const read = (name: string) =>
  JSON.parse(readFileSync(`experiments/results/p3/${name}.json`, "utf8"));
const batches = JOBS.map((job) => {
  const base: Batch = read(job.id),
    late: Batch = read(`${job.id}-late`),
    extension: Batch = read(`${job.id}-100`);
  if (!base.complete || !late.complete || !extension.complete)
    throw Error(`Incomplete ${job.id}`);
  const games = [...base.games, ...late.games];
  return {
    job,
    base,
    late,
    extension,
    games,
    metrics: metrics(games),
    agents: agentSummary(games, AGENTS[job.pair[0]].name),
  };
});
const first: Batch = read("first-moves");
const allGames = [
  ...batches.flatMap((b) => [...b.games, ...b.extension.games]),
  ...first.games,
];
const proof: {
  queries: number;
  results: {
    id: string;
    record: unknown;
    attacker: string;
    proofs: {
      maxPly: number;
      result: string;
      distance?: number;
      nodes: number;
    }[];
  }[];
} = read("mate-corpus");
const libraryNames = [
  "expiry-lock",
  "expiring-threat",
  "unique-defense",
  "search-disagreement",
  "expiry-swing",
];
const libraries = Object.fromEntries(
  libraryNames.map((name) => [
    name,
    JSON.parse(readFileSync(`positions/${name}.json`, "utf8")) as {
      detected: number;
      saved: number;
      bySource: Record<string, number>;
      scannedPrefixes: number;
    },
  ]),
);
const openingClasses: {
  classes: {
    representativeCoordinate: number[];
    coordinates: number[][];
    heuristicForX: number;
    outcomes: ReturnType<typeof metrics>;
  }[];
} = read("first-move-analysis");
const counts = Object.fromEntries(
  ["forced-win", "not-found", "unknown"].map((kind) => [
    kind,
    proof.results.flatMap((c) => c.proofs).filter((p) => p.result === kind)
      .length,
  ]),
);
const data = {
  generatedAt: new Date().toISOString(),
  settings: SETTINGS,
  agents: AGENTS,
  rules: RULES,
  executions: allGames.length,
  uniqueTrajectories: new Set(allGames.map((g) => g.trajectoryHash)).size,
  symmetryUniqueTrajectories: new Set(allGames.map((g) => g.symmetryHash)).size,
  primaryAndLateExecutions: batches.reduce((n, b) => n + b.games.length, 0),
  extensionExecutions: batches.reduce(
    (n, b) => n + b.extension.games.length,
    0,
  ),
  firstMoveExecutions: first.games.length,
  batches: batches.map((b) => ({
    job: b.job,
    metrics: b.metrics,
    agents: b.agents,
    extension: metrics(b.extension.games),
  })),
  proofQueries: proof.queries,
  proofCounts: counts,
  libraries: Object.fromEntries(
    Object.entries(libraries).map(([name, library]) => [
      name,
      {
        detected: library.detected,
        saved: library.saved,
        bySource: library.bySource,
        scannedPrefixes: library.scannedPrefixes,
        file: `positions/${name}.json`,
      },
    ]),
  ),
  firstMoveClasses: openingClasses.classes,
};
writeFileSync(
  "experiments/results/p3/analysis.json",
  JSON.stringify(data, null, 2),
);
console.log({
  executions: data.executions,
  unique: data.uniqueTrajectories,
  proofCounts: counts,
  ai: data.batches
    .filter((b) => b.job.rule === "C")
    .map((b) => ({
      id: b.job.id,
      metrics: b.metrics.counts,
      agents: b.agents.deduplicated,
    })),
  parameters: data.batches
    .filter((b) => b.job.pair[0] === "hard" && b.job.pair[1] === "normal")
    .map((b) => ({
      rule: b.job.rule,
      activation: b.metrics.fifoActivation,
      pre: b.metrics.activationFromPreDeletionOpenings,
      cutoff: b.metrics.cutoff,
    })),
});
