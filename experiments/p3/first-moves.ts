import { readFileSync, writeFileSync } from "node:fs";
import { firstMoveOrbits } from "../../src/research/symmetry";
import { applyMove, initialState } from "../../src/core";
import { chooseMove, evaluate } from "../../src/ai";
import { RULES, AGENTS } from "./config";
import { type Batch } from "./runner";
import { metrics } from "./metrics";
const games: Batch = JSON.parse(
  readFileSync("experiments/results/p3/first-moves.json", "utf8"),
);
if (!games.complete) throw Error("First-move games incomplete");
const classes = firstMoveOrbits(6).map((orbit, i) => {
  const state = applyMove(initialState(RULES.C), orbit.representative).state;
  return {
    ...orbit,
    representativeCoordinate: [
      Math.floor(orbit.representative / 6),
      orbit.representative % 6,
    ],
    coordinates: orbit.cells.map((c) => [Math.floor(c / 6), c % 6]),
    heuristicForX: evaluate(state, "X"),
    responses: Object.fromEntries(
      ["normal", "hard"].map((name) => [
        name,
        chooseMove(state, AGENTS[name].budget, AGENTS[name].algorithm),
      ]),
    ),
    outcomes: metrics(games.games.filter((g) => g.opening.id === `orbit-${i}`)),
    gameIds: games.games
      .filter((g) => g.opening.id === `orbit-${i}`)
      .map((g) => g.id),
  };
});
writeFileSync(
  "experiments/results/p3/first-move-analysis.json",
  JSON.stringify(
    {
      rules: RULES.C,
      budgets: AGENTS,
      method:
        "Six D4 first-move orbits. Representative only, two role-swapped games each at60 cutoff. Static score is X heuristic; search response score is O perspective. Neither is a solved value. Ordering tie-breaks may be orientation dependent; no symmetry score TT used.",
      classes,
    },
    null,
    2,
  ),
);
console.log(
  classes.map((c) => ({
    representative: c.representativeCoordinate,
    size: c.cells.length,
    counts: c.outcomes.counts,
  })),
);
