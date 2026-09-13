import { readFileSync, writeFileSync } from "node:fs";
import { chooseMove, AI_VERSION, type Algorithm, type Budget } from "../src/ai";
import {
  applyMove,
  initialState,
  validateRules,
  type Player,
  type RecordFile,
  type Result,
  type Rules,
} from "../src/core";
interface Agent {
  algorithm: Algorithm;
  budget: Budget;
}
interface Experiment {
  rules: Rules;
  seeds: number[];
  cutoff: number;
  agents: [Agent, Agent];
}
interface Game {
  seed: number;
  swapped: boolean;
  algorithmVersion: string;
  players: Record<Player, Agent>;
  record: RecordFile;
  result: Result | { kind: "cutoff" };
  plies: number;
  deletions: number;
  firstDeletionPly: number | null;
  deletionBeforeWin: boolean | null;
  nodes: number;
  tacticalNodes: number;
}
function validate(value: unknown): Experiment {
  if (!value || typeof value !== "object") throw Error("实验配置必须为对象");
  const c = value as Experiment;
  const rules = validateRules(c.rules);
  if (
    !Array.isArray(c.seeds) ||
    !c.seeds.length ||
    c.seeds.length > 100 ||
    !c.seeds.every(Number.isSafeInteger)
  )
    throw Error("seeds 必须为 1～100 个整数");
  if (!Number.isInteger(c.cutoff) || c.cutoff < 1 || c.cutoff > 10000)
    throw Error("cutoff 必须为 1～10000");
  if (!Array.isArray(c.agents) || c.agents.length !== 2)
    throw Error("需要两名 AI");
  for (const a of c.agents) {
    if (!["random", "tactical", "search"].includes(a.algorithm))
      throw Error("未知 AI");
    const b = a.budget;
    if (
      !b ||
      !Number.isInteger(b.maxNodes) ||
      b.maxNodes < 0 ||
      b.maxNodes > 1_000_000 ||
      !Number.isInteger(b.maxDepth) ||
      b.maxDepth < 0 ||
      b.maxDepth > 12 ||
      !Number.isSafeInteger(b.seed) ||
      b.timeMs !== null
    )
      throw Error(
        "批量实验要求固定节点预算≤1000000、深度0～12、整数种子、timeMs:null",
      );
  }
  return { ...c, rules };
}
function run(c: Experiment, seed: number, swapped: boolean): Game {
  let state = initialState(c.rules);
  const players = {
      X: c.agents[swapped ? 1 : 0],
      O: c.agents[swapped ? 0 : 1],
    },
    moves: number[] = [];
  let deletions = 0,
    firstDeletionPly: number | null = null,
    nodes = 0,
    tacticalNodes = 0;
  while (!state.result && state.ply < c.cutoff) {
    const a = players[state.turn];
    const d = chooseMove(
      state,
      {
        ...a.budget,
        seed: (seed + a.budget.seed + Math.imul(state.ply, 2654435761)) >>> 0,
      },
      a.algorithm,
    );
    if (d.move === null) throw Error("AI 未返回合法点");
    const next = applyMove(state, d.move);
    moves.push(d.move);
    state = next.state;
    nodes += d.nodes;
    tacticalNodes += d.tacticalNodes;
    if (next.event.removed !== null) {
      deletions++;
      firstDeletionPly ??= state.ply;
    }
  }
  return {
    seed,
    swapped,
    algorithmVersion: AI_VERSION,
    players,
    record: {
      schemaVersion: 1,
      rules: c.rules,
      moves,
      metadata: { seed, swapped, algorithmVersion: AI_VERSION, players },
    },
    result: state.result ?? { kind: "cutoff" },
    plies: state.ply,
    deletions,
    firstDeletionPly,
    deletionBeforeWin:
      c.rules.retention.kind === "permanent" || state.result?.kind !== "win"
        ? null
        : deletions > 0,
    nodes,
    tacticalNodes,
  };
}
try {
  const input = process.argv[2] ?? "experiments/smoke.json",
    output = process.argv[3] ?? "experiments/smoke-results.json";
  const raw: unknown = JSON.parse(
    readFileSync(input, "utf8").replace(/^\uFEFF/, ""),
  );
  const configs = (Array.isArray(raw) ? raw : [raw]).map(validate);
  const batches = configs.map((config) => {
    const games = config.seeds.flatMap((seed) => [
      run(config, seed, false),
      run(config, seed, true),
    ]);
    const counts = {
      "X-win": 0,
      "O-win": 0,
      repetition: 0,
      "no-moves": 0,
      "ply-limit": 0,
      cutoff: 0,
    };
    for (const g of games) {
      const key =
        g.result.kind === "win"
          ? (`${g.result.winner}-win` as const)
          : g.result.kind === "draw"
            ? g.result.reason
            : "cutoff";
      counts[key]++;
    }
    const decisive = games.filter((g) => g.result.kind === "win");
    return {
      config,
      summary: {
        counts,
        allGamesMeanPlies:
          games.reduce((s, g) => s + g.plies, 0) / games.length,
        decisiveGames: decisive.length,
        decisiveMeanPlies: decisive.length
          ? decisive.reduce((s, g) => s + g.plies, 0) / decisive.length
          : null,
      },
      games,
    };
  });
  writeFileSync(
    output,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "每个种子交换先后手。长度均值包含 cutoff；胜负局单独统计。固定节点预算可复现，重复相同确定性对局不构成额外独立证据。弱 AI 样本不能推导理论公平。",
        batches,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { output, summaries: batches.map((b) => b.summary) },
      null,
      2,
    ),
  );
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
