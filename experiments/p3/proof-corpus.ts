import { readFileSync, writeFileSync } from "node:fs";
import { RULES } from "./config";
import { replay, type RecordFile } from "../../src/core";
import { proveMate, type MateResult } from "../../src/research/mate";
import fixtures from "../../fixtures/rule-cases.json";
const prefix = (i: number) =>
  fixtures.cases[i].prefixMoves.map(([r, c]) => r * 6 + c);
const cases = [
  {
    id: "ordinary-direct-five",
    rules: RULES.C,
    moves: [0, 30, 1, 32, 2, 34, 3, 6],
    attacker: "X" as const,
  },
  {
    id: "ordinary-open-four-fork",
    rules: RULES.C,
    moves: [13, 0, 14, 2, 15, 30],
    attacker: "X" as const,
  },
  {
    id: "ordinary-one-defense",
    rules: RULES.C,
    moves: [0, 30, 2, 31, 6, 32, 8, 33],
    attacker: "O" as const,
  },
  {
    id: "fixture-expiry-lock",
    rules: RULES.C,
    moves: prefix(1),
    attacker: "O" as const,
  },
  {
    id: "defender-expiry-mate3",
    rules: RULES.C,
    moves: [0, 14, 2, 35, 12, 30, 13, 32, 15, 6, 16, 8],
    attacker: "X" as const,
  },
  {
    id: "same-occupancy-different-age",
    rules: RULES.C,
    moves: [0, 35, 2, 14, 12, 30, 13, 32, 15, 6, 16, 8],
    attacker: "X" as const,
  },
  {
    id: "fixture-false-five",
    rules: RULES.C,
    moves: prefix(0),
    attacker: "X" as const,
  },
  {
    id: "fixture-counterexample",
    rules: RULES.C,
    moves: prefix(2),
    attacker: "O" as const,
  },
  {
    id: "classic-fork-mate5",
    rules: {
      ...RULES.C,
      boardSize: 3,
      winLength: 3,
      retention: { kind: "permanent" as const },
    },
    moves: [0, 1],
    attacker: "X" as const,
  },
];
const results: {
  id: string;
  record: RecordFile;
  attacker: "X" | "O";
  proofs: MateResult[];
}[] = cases.map((c) => {
  const state = replay(c.rules, c.moves).at(-1)!;
  return {
    id: c.id,
    record: { schemaVersion: 1, rules: c.rules, moves: c.moves },
    attacker: c.attacker,
    proofs: [1, 2, 3, 5, 7].map((maxPly) =>
      proveMate(state, {
        maxPly,
        attacker: c.attacker,
        maxNodes: 50000,
        timeMs: null,
      }),
    ),
  };
});
writeFileSync(
  "experiments/results/p3/mate-corpus.json",
  JSON.stringify(
    {
      method:
        "Reference fixtures and explicitly labelled regression cases, all legal from start. N counts all atomic actions, not attacker turns. Distance is upper bound, not minimal. Budget per query 50000 generated states, no time limit.",
      sourceFiles: ["fixtures/rule-cases.json", "tests/mate.test.ts"],
      queries: results.reduce((a, c) => a + c.proofs.length, 0),
      results,
    },
    null,
    2,
  ),
);
console.log(
  results.map((c) => ({
    id: c.id,
    proofs: c.proofs.map((p) => [p.maxPly, p.result, p.distance, p.nodes]),
  })),
);
// Touch the original fixture via filesystem only to ensure the checked-in source is present.
if (!readFileSync("fixtures/rule-cases.json", "utf8"))
  throw Error("missing fixture");
