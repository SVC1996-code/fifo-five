import { summarize } from "./summary";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import {
  chooseMove,
  AI_VERSION,
  type Diagnostics,
  type Budget,
} from "../../src/ai";
import {
  chooseMove as baseline,
  AI_VERSION as baselineVersion,
} from "./baseline-ai";
import {
  scenarios,
  normal,
  openings,
  pairs,
  SEEDS,
  CUTOFF_PLIES,
  type Agent,
  type Scenario,
} from "./suite";
import {
  applyMove,
  legalMoves,
  replay,
  type State,
  type Rules,
  type Player,
  type Result,
  type RecordFile,
} from "../../src/core";
interface Sample extends Diagnostics {
  scenario: string;
  rules: Rules;
  opening: number[];
  agent: Agent;
  repeat: number;
}
interface Decision extends Diagnostics {
  ply: number;
  player: Player;
  agent: string;
  budget: Budget;
}
interface Game {
  id: string;
  pair: string[];
  opening: Scenario;
  seed: number;
  swapped: boolean;
  players: Record<Player, Agent>;
  cutoff: number;
  record: RecordFile;
  trajectoryHash: string;
  result: Result | { kind: "cutoff" };
  decisions: Decision[];
}
export const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function stats(values: number[]) {
  const a = [...values].sort((x, y) => x - y);
  return {
    samples: a.length,
    median:
      a.length % 2
        ? a[(a.length - 1) / 2]
        : (a[a.length / 2 - 1] + a[a.length / 2]) / 2,
    p95: a[Math.ceil(a.length * 0.95) - 1],
    max: a.at(-1),
  };
}
const mode = process.argv[2] ?? "timing",
  version = process.argv[3] ?? "current",
  out = process.argv[4] ?? `experiments/results/${mode}-${version}.json`;
if (!["baseline", "current"].includes(version))
  throw Error("version must be baseline or current");
const filter = process.argv[5] ?? "all";
const selectedPairs = pairs.filter(
  (pair) => filter === "all" || pair.map((a) => a.name).join("-vs-") === filter,
);
if (!selectedPairs.length) throw Error("Unknown pair filter");
const plannedGames = selectedPairs.length * openings.length * SEEDS.length * 2;
const choose = version === "baseline" ? baseline : chooseMove;
const env = {
  node: process.version,
  platform: process.platform,
  release: os.release(),
  arch: os.arch(),
  cpu: os.cpus()[0]?.model,
  logicalCpus: os.cpus().length,
  memoryBytes: os.totalmem(),
};
const source = readFileSync(
  version === "baseline" ? "experiments/p2/baseline-ai.ts" : "src/ai/index.ts",
  "utf8",
);
const common = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  version: version === "baseline" ? baselineVersion : AI_VERSION,
  sourceHash: hash(source),
  environment: env,
};
const save = (data: object) =>
  writeFileSync(out, JSON.stringify({ ...common, ...data }, null, 2));
if (mode === "timing") {
  const samples: Sample[] = [];
  const repeats = 3;
  const probes = [
    {
      ...normal,
      name: "probe-500",
      budget: { ...normal.budget, maxNodes: 500, maxDepth: 8 },
    },
  ];
  // Warm the module and line cache outside measurements. Each scenario/budget then
  // gets one unrecorded warmup. No concurrent games or test processes in this run.
  for (const scenario of scenarios)
    for (const agent of probes) {
      const state = replay(scenario.rules, scenario.moves).at(-1)!;
      choose(state, { ...agent.budget, maxNodes: 100 }, agent.algorithm);
      for (let repeat = 0; repeat < repeats; repeat++) {
        const d = choose(state, agent.budget, agent.algorithm);
        samples.push({
          scenario: scenario.id,
          rules: scenario.rules,
          opening: scenario.moves,
          agent,
          repeat,
          ...d,
        });
        console.log(
          `${scenario.id}/${agent.name} ${repeat + 1}/${repeats}: total=${d.elapsedMs.toFixed(1)}ms tactical=${d.tacticalMs.toFixed(1)} search=${d.searchMs.toFixed(1)} nodes=${d.nodes} depth=${d.depth}`,
        );
        save({ complete: false, repeats, samples });
      }
    }
  const groups = scenarios.flatMap((s) =>
    probes.map((a) => {
      const rows = samples.filter(
        (r) => r.scenario === s.id && r.agent.name === a.name,
      );
      return {
        scenario: s.id,
        agent: a.name,
        tactical: stats(rows.map((r) => r.tacticalMs)),
        search: stats(rows.map((r) => r.searchMs)),
        total: stats(rows.map((r) => r.elapsedMs)),
      };
    }),
  );
  save({
    complete: true,
    repeats,
    sampleCount: samples.length,
    method:
      "Node synchronous chooseMove, fixed nodes, timeMs:null; one 100-node warmup per cell; three observations per cell; P95 nearest rank, with n=3 equals max. Not browser/end-to-end latency or stability evidence.",
    groups,
    samples,
  });
} else if (mode === "strength") {
  const games: Game[] = [];
  const mistakes: object[] = [];
  function audit(s: State, move: number, prefix: number[], gameId: string) {
    const children = legalMoves(s).map((m) => ({
      move: m,
      state: applyMove(s, m).state,
    }));
    const wins = children.filter((c) => c.state.result?.kind === "win");
    const chosen = children.find((c) => c.move === move)!;
    const unsafe = (c: State) =>
      legalMoves(c).some((m) => applyMove(c, m).state.result?.kind === "win");
    if (wins.length && chosen.state.result?.kind !== "win")
      mistakes.push({
        gameId,
        kind: "missed-one-ply-win",
        rules: s.rules,
        moves: [...prefix],
        chosen: move,
        correct: wins.map((c) => c.move),
      });
    else if (!wins.length && unsafe(chosen.state)) {
      const safe = children.filter((c) => !unsafe(c.state));
      if (safe.length)
        mistakes.push({
          gameId,
          kind: "allowed-one-ply-win",
          rules: s.rules,
          moves: [...prefix],
          chosen: move,
          correct: safe.map((c) => c.move),
        });
    }
  }
  for (const pair of selectedPairs)
    for (const opening of openings)
      for (const seed of SEEDS)
        for (const swapped of [false, true]) {
          const players = {
            X: pair[swapped ? 1 : 0],
            O: pair[swapped ? 0 : 1],
          };
          const id = `${pair[0].name}-vs-${pair[1].name}/${opening.id}/${seed}/${swapped}`;
          let state = replay(opening.rules, opening.moves).at(-1)!;
          const moves = [...opening.moves],
            decisions: Decision[] = [];
          while (!state.result && state.ply < CUTOFF_PLIES) {
            const agent = players[state.turn];
            const budget = {
              ...agent.budget,
              seed:
                (seed +
                  agent.budget.seed +
                  Math.imul(state.ply, 2654435761)) >>>
                0,
            };
            const d = choose(state, budget, agent.algorithm);
            if (d.move === null) throw Error("非终局返回空着法");
            audit(state, d.move, moves, id);
            decisions.push({
              ply: state.ply,
              player: state.turn,
              agent: agent.name,
              budget,
              ...d,
            });
            moves.push(d.move);
            state = applyMove(state, d.move).state;
          }
          const record: RecordFile = {
            schemaVersion: 1,
            rules: opening.rules,
            moves,
          };
          games.push({
            id,
            pair: pair.map((a) => a.name),
            opening,
            seed,
            swapped,
            players,
            cutoff: CUTOFF_PLIES,
            record,
            trajectoryHash: hash(record),
            result: state.result ?? { kind: "cutoff" },
            decisions,
          });
          console.log(
            `${games.length}/${plannedGames} ${id}: ${JSON.stringify(state.result ?? { kind: "cutoff" })}, ${moves.length} plies`,
          );
          save({ complete: false, games, mistakes });
        }
  const summaries = selectedPairs.map((pair) => ({
    pair: pair.map((a) => a.name),
    ...summarize(
      games.filter(
        (g) => g.pair.join("/") === pair.map((a) => a.name).join("/"),
      ),
      pair[0].name,
    ),
  }));
  save({
    complete: true,
    plannedGames,
    completedGames: games.length,
    uniqueTrajectories: new Set(games.map((g) => g.trajectoryHash)).size,
    trajectoryDefinition:
      "SHA256 of canonical rules and full move sequence, independent of seed/agent label. Exact duplicates removed; symmetry-equivalent trajectories are not merged. Different traces are not automatically statistically independent.",
    summaries,
    games,
    mistakes,
    auditScope:
      "Every generated move: missed stable one-ply win or allowed one-ply win when safe reply exists; not a multi-ply perfect oracle.",
  });
} else throw Error("mode must be timing or strength");
