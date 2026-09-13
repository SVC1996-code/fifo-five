import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import { AI_VERSION, chooseMove, type Diagnostics } from "../../src/ai";
import {
  applyMove,
  replay,
  type RecordFile,
  type Result,
  type Player,
} from "../../src/core";
import { expirySwing, expiringThreats } from "../../src/research/mining";
import { canonicalTrajectory } from "../../src/research/symmetry";
import {
  RULES,
  AGENTS,
  SETTINGS,
  JOBS,
  RESEARCH_VERSION,
  openingSet,
  firstOpenings,
  type Opening,
  type Agent,
} from "./config";
export const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export interface Decision extends Diagnostics {
  ply: number;
  player: Player;
  agent: string;
  seed: number;
}
export interface Game {
  id: string;
  rule: string;
  pair: string[];
  opening: Opening;
  seed: number;
  swapped: boolean;
  players: Record<Player, Agent>;
  record: RecordFile;
  trajectoryHash: string;
  symmetryHash: string;
  result: Result | { kind: "cutoff" };
  cutoff: number;
  plies: number;
  deletions: number;
  firstDeletionPly: number | null;
  deletionBeforeWin: boolean | null;
  pliesAfterFirstDeletion: number | null;
  swingPlies: number[];
  threatPlies: number[];
  decisions: Decision[];
}
export interface Batch {
  complete: boolean;
  job: string;
  planHash: string;
  settings: typeof SETTINGS;
  games: Game[];
  summary: ReturnType<typeof summarize>;
  environment: object;
  algorithmVersion: string;
  researchVersion: string;
  sourceHashes: Record<string, string>;
}
export function summarize(games: Game[]) {
  const distinct = [
    ...new Map(games.map((g) => [g.trajectoryHash, g])).values(),
  ];
  const classified = (gs: Game[]) => {
    const c = {
      X: 0,
      O: 0,
      repetition: 0,
      "no-moves": 0,
      "ply-limit": 0,
      cutoff: 0,
    };
    for (const g of gs) {
      if (g.result.kind === "win") c[g.result.winner]++;
      else if (g.result.kind === "draw") c[g.result.reason]++;
      else c.cutoff++;
    }
    return c;
  };
  return {
    executed: games.length,
    unique: distinct.length,
    symmetryUnique: new Set(games.map((g) => g.symmetryHash)).size,
    all: classified(games),
    deduplicated: classified(distinct),
  };
}
export function runGame(
  rule: string,
  pair: string[],
  opening: Opening,
  seed: number,
  swapped: boolean,
  cutoff: number,
): Game {
  const rules = RULES[rule],
    players = {
      X: AGENTS[pair[swapped ? 1 : 0]],
      O: AGENTS[pair[swapped ? 0 : 1]],
    },
    moves = [...opening.moves],
    decisions: Decision[] = [];
  const history = replay(rules, moves);
  let state = history.at(-1)!,
    deletions = 0,
    firstDeletionPly: number | null = null;
  const swingPlies: number[] = [],
    threatPlies: number[] = [];
  const track = (before: typeof state, move: number) => {
    const next = applyMove(before, move);
    if (next.event.removed !== null) {
      deletions++;
      firstDeletionPly ??= next.state.ply;
      if (expirySwing(before, move)) swingPlies.push(next.state.ply);
    }
    if (expiringThreats(before).length) threatPlies.push(before.ply);
    return next.state;
  };
  for (let p = 0; p < moves.length; p++) track(history[p], moves[p]);
  while (!state.result && state.ply < cutoff) {
    const agent = players[state.turn],
      moveSeed =
        (seed + agent.budget.seed + Math.imul(state.ply, 2654435761)) >>> 0,
      d = chooseMove(
        state,
        { ...agent.budget, seed: moveSeed },
        agent.algorithm,
      );
    if (d.move === null) throw Error("No legal AI move");
    decisions.push({
      ...d,
      ply: state.ply,
      player: state.turn,
      agent: agent.name,
      seed: moveSeed,
    });
    moves.push(d.move);
    state = track(state, d.move);
  }
  const record: RecordFile = { schemaVersion: 1, rules, moves };
  return {
    id: `${rule}/${pair.join("-")}/${opening.id}/${seed}/${swapped}/${cutoff}`,
    rule,
    pair,
    opening,
    seed,
    swapped,
    players,
    record,
    trajectoryHash: hash(record),
    symmetryHash: hash(canonicalTrajectory(rules, moves)),
    result: state.result ?? { kind: "cutoff" },
    cutoff,
    plies: state.ply,
    deletions,
    firstDeletionPly,
    deletionBeforeWin: state.result?.kind === "win" ? deletions > 0 : null,
    pliesAfterFirstDeletion:
      firstDeletionPly === null ? null : state.ply - firstDeletionPly,
    swingPlies,
    threatPlies,
    decisions,
  };
}
export function runBatch(jobId: string) {
  const first = jobId === "first-moves";
  const job = first
    ? { id: jobId, rule: "C", pair: ["hard", "normal"] }
    : JOBS.find((j) => j.id === jobId);
  if (!job) throw Error("Unknown job");
  const openings = first ? firstOpenings() : openingSet(RULES[job.rule]),
    seeds = first ? [SETTINGS.seeds[0]] : SETTINGS.seeds;
  const plan = {
    job,
    rules: RULES[job.rule],
    agents: AGENTS,
    settings: SETTINGS,
    openings,
    seeds,
  };
  const path = `experiments/results/p3/${job.id}.json`,
    planHash = hash(plan);
  const existing: Batch | null = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : null;
  if (existing && existing.planHash !== planHash)
    throw Error(
      "Plan changed: choose a separate output directory/version instead of overwriting evidence",
    );
  const games: Game[] = existing?.games ?? [];
  if (existing?.complete) {
    console.log(`${jobId} already complete (${games.length} executions)`);
    return;
  }
  const sourceHashes = Object.fromEntries(
    ["src/ai/index.ts", "src/core/index.ts", "src/research/mate.ts"].map(
      (p) => [p, hash(readFileSync(p, "utf8"))],
    ),
  );
  const save = (complete: boolean) =>
    writeFileSync(
      path,
      JSON.stringify(
        {
          complete,
          job: job.id,
          plan,
          planHash,
          settings: SETTINGS,
          researchVersion: RESEARCH_VERSION,
          algorithmVersion: AI_VERSION,
          sourceHashes,
          environment: {
            node: process.version,
            platform: os.platform(),
            release: os.release(),
            cpu: os.cpus()[0]?.model,
          },
          games,
          summary: summarize(games),
        },
        null,
        2,
      ),
    );
  save(false);
  for (let i = 0; i < openings.length; i++) {
    for (const seed of seeds)
      for (const swapped of [false, true]) {
        const id = `${job.rule}/${job.pair.join("-")}/${openings[i].id}/${seed}/${swapped}/${SETTINGS.cutoff}`;
        if (games.some((g) => g.id === id)) continue;
        const game = runGame(
          job.rule,
          job.pair,
          openings[i],
          seed,
          swapped,
          SETTINGS.cutoff,
        );
        games.push(game);
        save(false);
        console.log(
          `${job.id}: ${games.length} executions / ${summarize(games).unique} unique, ${game.result.kind === "win" ? game.result.winner : game.result.kind === "draw" ? game.result.reason : "cutoff"} ${game.plies} ply`,
        );
      }
    if (
      !first &&
      i + 1 >= SETTINGS.minOpenings &&
      summarize(games).unique >= SETTINGS.targetUnique
    )
      break;
  }
  save(true);
}
