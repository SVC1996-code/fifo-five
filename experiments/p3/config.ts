import {
  DEFAULT_RULES,
  validateRules,
  replay,
  applyMove,
  legalMoves,
  other,
  type Rules,
} from "../../src/core";
import {
  DIFFICULTIES,
  seeded,
  type Algorithm,
  type Budget,
} from "../../src/ai";
import {
  canonicalTrajectory,
  firstMoveOrbits,
} from "../../src/research/symmetry";
import { proveMate } from "../../src/research/mate";
export const RESEARCH_VERSION = "p3-pilot-1";
export const RULES: Record<string, Rules> = Object.fromEntries(
  [
    ["A", 5, 4, 5],
    ["B", 6, 5, 5],
    ["C", 6, 5, 6],
    ["D", 6, 5, 7],
    ["E", 7, 5, 6],
  ].map(([id, n, w, k]) => [
    id,
    validateRules({
      ...DEFAULT_RULES,
      boardSize: n,
      winLength: w,
      retention: { kind: "fifo", maxStones: k },
    }),
  ]),
);
export interface Agent {
  name: string;
  algorithm: Algorithm;
  budget: Budget;
}
export const AGENTS: Record<string, Agent> = {
  normal: {
    name: "normal-research",
    algorithm: "search",
    budget: { ...DIFFICULTIES["正常"], maxNodes: 128, timeMs: null },
  },
  hard: {
    name: "hard-research",
    algorithm: "search",
    budget: { ...DIFFICULTIES["困难"], maxNodes: 960, timeMs: null },
  },
  tactical: {
    name: "tactical",
    algorithm: "tactical",
    budget: { ...DIFFICULTIES["简单"], timeMs: null },
  },
};
export const SETTINGS = {
  seeds: [20260913, 20260929],
  cutoff: 60,
  targetUnique: 20,
  minOpenings: 12,
  maxOpenings: 20,
  extensionCutoff: 100,
  extensionTrigger: 0.25,
  extensionMaxUnique: 4,
};
export interface Opening {
  id: string;
  moves: number[];
  generationSeed: number | null;
  deletions: number;
  phase: string;
  canonical: string;
}
export function openingSet(rules: Rules): Opening[] {
  const n = rules.boardSize,
    k =
      rules.retention.kind === "fifo"
        ? rules.retention.maxStones
        : rules.winLength,
    mid = Math.floor((n - 1) / 2) * n + Math.floor((n - 1) / 2);
  const explicit = [
    [],
    [mid, mid + 1],
    [mid, mid + 1, mid + n, mid + n + 1],
    [0, n * n - 1, 1, n * n - 2],
  ];
  const lengths = [
    0,
    2,
    4,
    4,
    6,
    6,
    8,
    8,
    2 * k - 2,
    2 * k - 2,
    2 * k,
    2 * k,
    2 * k + 2,
    2 * k + 2,
    2 * k + 4,
    2 * k + 4,
    2 * k + 6,
    2 * k + 8,
    2 * k + 10,
    2 * k + 12,
  ];
  const seen = new Set<string>(),
    result: Opening[] = [];
  for (let i = 0; i < SETTINGS.maxOpenings; i++) {
    for (let attempt = 0; attempt < 10000; attempt++) {
      const seed = 20260913 + n * 100000 + i * 1000 + attempt,
        random = seeded(seed);
      let state = replay(rules, [])[0],
        moves: number[] = [],
        deletions = 0;
      if (i < explicit.length && attempt === 0) moves = [...explicit[i]];
      else {
        for (let ply = 0; ply < lengths[i] && !state.result; ply++) {
          const legal = legalMoves(state),
            move = legal[Math.floor(random() * legal.length)];
          moves.push(move);
          state = applyMove(state, move).state;
        }
      }
      const history = replay(rules, moves);
      state = history.at(-1)!;
      if (state.result) continue;
      const canonical = canonicalTrajectory(rules, moves);
      if (seen.has(canonical)) continue;
      if (
        proveMate(state, { maxPly: 1, maxNodes: 10000, timeMs: null })
          .result !== "not-found" ||
        proveMate(state, {
          attacker: other(state.turn),
          maxPly: 2,
          maxNodes: 10000,
          timeMs: null,
        }).result !== "not-found"
      )
        continue;
      for (let p = 0; p < moves.length; p++)
        if (applyMove(history[p], moves[p]).event.removed !== null) deletions++;
      seen.add(canonical);
      result.push({
        id: `opening-${i.toString().padStart(2, "0")}`,
        moves,
        generationSeed: i < explicit.length && attempt === 0 ? null : seed,
        deletions,
        phase:
          i === 0
            ? "empty"
            : i === 1 || i === 2
              ? "centre"
              : i === 3
                ? "edge-corner"
                : deletions
                  ? "post-deletion"
                  : moves.length >= 2 * k - 2
                    ? "age-pressure"
                    : "early",
        canonical,
      });
      break;
    }
    if (result.length !== i + 1) throw Error("Cannot generate valid opening");
  }
  return result;
}
export const JOBS = [
  { id: "C-normal-tactical", rule: "C", pair: ["normal", "tactical"] },
  { id: "C-hard-tactical", rule: "C", pair: ["hard", "tactical"] },
  ...["A", "B", "C", "D", "E"].map((rule) => ({
    id: `${rule}-hard-normal`,
    rule,
    pair: ["hard", "normal"],
  })),
];
export function firstOpenings(): Opening[] {
  return firstMoveOrbits(6).map((o, i) => ({
    id: `orbit-${i}`,
    moves: [o.representative],
    generationSeed: null,
    deletions: 0,
    phase: "first-move-orbit",
    canonical: canonicalTrajectory(RULES.C, [o.representative]),
  }));
}
