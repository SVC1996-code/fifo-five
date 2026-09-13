import {
  DEFAULT_RULES,
  replay,
  validateRules,
  type Rules,
} from "../../src/core";
import { DIFFICULTIES, type Algorithm, type Budget } from "../../src/ai";
import fixtures from "../../fixtures/rule-cases.json";
export interface Scenario {
  id: string;
  rules: Rules;
  moves: number[];
}
export const openings: Scenario[] = [
  { id: "central-four", rules: DEFAULT_RULES, moves: [14, 15, 20, 21] },
  { id: "off-centre-six", rules: DEFAULT_RULES, moves: [7, 28, 9, 26, 19, 16] },
  { id: "edge-six", rules: DEFAULT_RULES, moves: [0, 35, 2, 33, 12, 23] },
];
export const scenarios: Scenario[] = [6, 9].flatMap((n) => [
  {
    id: `${n}-opening`,
    rules: validateRules({ ...DEFAULT_RULES, boardSize: n }),
    moves: [],
  },
  {
    id: `${n}-midgame`,
    rules: validateRules({ ...DEFAULT_RULES, boardSize: n }),
    moves: fixtures.cases[0].prefixMoves.map(([r, c]) => r * n + c),
  },
  {
    id: `${n}-age-lock`,
    rules: validateRules({ ...DEFAULT_RULES, boardSize: n }),
    moves: fixtures.cases[1].prefixMoves.map(([r, c]) => r * n + c),
  },
]);
export interface Agent {
  name: string;
  algorithm: Algorithm;
  budget: Budget;
}
export const normal: Agent = {
  name: "normal",
  algorithm: "search",
  budget: { ...DIFFICULTIES["正常"], timeMs: null },
};
export const hard: Agent = {
  name: "hard",
  algorithm: "search",
  budget: { ...DIFFICULTIES["困难"], timeMs: null },
};
export const tactical: Agent = {
  name: "tactical",
  algorithm: "tactical",
  budget: { ...DIFFICULTIES["简单"], timeMs: null },
};
export const pairs: [Agent, Agent][] = [
  [normal, tactical],
  [hard, normal],
];
export const SEEDS = [20260913];
export const CUTOFF_PLIES = 24;
for (const s of [...openings, ...scenarios])
  if (replay(s.rules, s.moves).at(-1)!.result)
    throw Error(`测试集开局已结束：${s.id}`);
