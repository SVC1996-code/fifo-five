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
  libraries,
  firstMoveClasses: openingClasses.classes,
};
writeFileSync(
  "experiments/results/p3/analysis.json",
  JSON.stringify(data, null, 2),
);
const num = (n: number | null) => (n === null ? "—" : n.toFixed(1)),
  pct = (r: { rate: number | null; numerator: number; denominator: number }) =>
    r.rate === null
      ? "—"
      : `${(r.rate * 100).toFixed(1)}% (${r.numerator}/${r.denominator})`;
const mrow = (b: (typeof batches)[number]) => {
  const m = b.metrics,
    c = m.counts;
  return `| ${b.job.id} | ${m.executed} | ${m.uniqueTrajectories} | ${c.X}/${c.O} | ${c.repetition}/${c["no-moves"]}/${c["ply-limit"]} | ${c.cutoff} (${pct(m.cutoff)}) | ${num(m.terminalLengths.mean)}/${num(m.terminalLengths.median)} | ${num(m.decisiveLengths.mean)}/${num(m.decisiveLengths.median)} |`;
};
const arow = (b: (typeof batches)[number]) => {
  const d = b.agents.deduplicated;
  return `| ${b.job.pair.join(" / ")} | ${d.agentAWin} / ${d.agentBWin} | ${d["ambiguous-role-assignment"]} | ${d.repetition + d["no-moves"] + d["ply-limit"]} | ${d.cutoff} |`;
};
const params = ["A", "B", "C", "D", "E"].map((id) =>
  batches.find((b) => b.job.id === `${id}-hard-normal`)!,
);
const paramrow = (b: (typeof batches)[number]) => {
  const m = b.metrics;
  return `| ${b.job.rule} | ${pct(m.fifoActivation)} | ${pct(m.activationFromPreDeletionOpenings)} | ${pct(m.newDeletionDuringContinuation)} | ${pct(m.winsAfterDeletion)} | ${pct(m.bothPlayersReachedDeletion)} | ${pct(m.deletionChangedGeometricCompletions)} | ${num(m.firstDeletionToTerminal.median)} |`;
};
let md = `# P3 棋力、战术与规则参数研究\n\n生成自 experiments/results/p3/*.json 与 positions/*.json。默认规则、原引擎、棋谱格式、AI、Worker和UI保持兼容；本轮只增加研究模块与脚本。未训练、未调用外部API、未推送或部署。\n\n## 1. 范围与方法\n\n环境：${JSON.stringify(batches[0].base.environment)}。研究档 normal=128节点/深度5，hard=960节点/深度8，均timeMs=null，战术预处理不计入搜索节点上限。保留网页8000/60000节点档位不变；本研究仅回答低预算档位上的问题，不能直接外推网页完整档位。节点预算相同也不代表各棋盘达到相同深度。每步实际节点/深度/PV均已保存。\n\n每种规则预先生成20个合法开局，覆盖空盘、中心、边角、2～3子、即将FIFO、已删除中盘、无当前一手胜或对方下一步强制杀的棋龄压力局面。保存完整moves和生成seed；D4等价完整开局去重。先跑达到至少20独特轨迹的批次，再无条件补齐后半开局以覆盖删除阶段。最终每个配对都覆盖20开局×2角色×2 seed；角色交换不改开局棋子。研究算法目前不靠seed打破评价相等的排序，因此许多seed重复产生同一轨迹，不当作独立样本。\n\n60-ply截止包含给定开局。独特轨迹按完整规则+从空盘开始的落子序列哈希识别，不含角色/seed标签；旋转镜像规范轨迹另计。不同轨迹不保证统计独立，跨开局可能有共同前缀。相同轨迹的不同角色归因冲突单列，不任意归给某AI。\n\n**实际完成 ${data.executions} 局执行；全局精确去重 ${data.uniqueTrajectories} 条轨迹，D4去重 ${data.symmetryUniqueTrajectories} 条。** 其中主对照/补齐 ${data.primaryAndLateExecutions} 局，100-ply条件延长 ${data.extensionExecutions} 局，首着代表实验 ${data.firstMoveExecutions} 局。100-ply轨迹与其60-ply前缀不是独立对局证据，虽然完整序列哈希不同；没有把这项总数解释成独立样本量。\n\n## 2. Mate Search\n\n独立AND/OR模块 src/research/mate.ts，支持总ply上限1/3/5/7，另外允许0～7便于防守方先行动的2-ply查询。N指从当前状态开始双方合计的进一步原子行动数，不是攻击方走N手。attacker默认行动方，可显式指定对方而不改turn。所有子局面经applyMove，包含FIFO、年龄、历史重复和规则手数上限；先删再判胜，不能续命。\n\nforced-win=已找到抵御所有合法防守的获胜策略；distance是该策略最坏分支的获胜ply上界，不保证最短。not-found=已证明指定范围内不存在该攻击方强制胜，不代表全局和棋。unknown=预算未完成，不能当无杀。节点计根与生成的每个合法后继，包括排序准备；没有分值TT或候选裁剪。PV只展示一个代表性防守分支，不是整棵证明树。\n\n9个明确标为参考/回归的合法局面，共${proof.queries}次查询，每次最多50000节点：${counts["forced-win"]} forced-win、${counts["not-found"]} not-found、${counts.unknown} unknown。\n\n| 合法参考局面 | 各总ply上限的结果（≤表示所证距离上界） |\n| --- | --- |\n`;
md += proof.results
  .map(
    (c) =>
      `| ${c.id}（攻击${c.attacker}） | ${c.proofs.map((p) => `${p.maxPly}: ${p.result}${p.distance !== undefined ? ` ≤${p.distance}` : ""}`).join("; ")} |`,
  )
  .join("\n");
md += `\n\n证据见 [mate-corpus.json](../experiments/results/p3/mate-corpus.json)。普通五连、开放四连3-ply杀、对手阻挡棋到期的3-ply杀、经典3×3的5-ply叉杀均有证明；已有到期锁是防守方先行动、对方在2个总ply内必胜。改变年龄顺序后的同占位局面结论不同。预算不足的5/7-ply查询明确保留unknown。完整测试还涵盖真实三次重复终局、重复历史影响分支、朴素全宽布尔oracle对照。\n\n## 3. 自动战术库\n\n所有权威输入均是可合法重放的record，非手工棋盘。按实验唯一前缀扫描，明确标注reference-fixture；保存全部已检测到的结构化样例，检测数不是独立局面概率。搜索分歧只对每批最多8个每8ply采样点及参考样例比较，不是全量分歧统计。\n\n| 类型 | 实验检测 | 参考样例检测 | 保存条数 |\n| --- | ---: | ---: | ---: |\n`;
md += libraryNames
  .map(
    (k) =>
      `| ${k} | ${libraries[k].bySource.experiment ?? 0} | ${libraries[k].bySource["reference-fixture"] ?? 0} | ${libraries[k].saved} |`,
  )
  .join("\n");
md += `\n\n- 到期锁要求“本方队首是唯一几何阻挡”并经完整2-ply证明对手必胜；未证明的候选在unproved-expiry-locks.json，不计为已证锁。\n- 到期伪威胁是某一条表面补齐线在真实删除后消失；另有获胜线时会注明，不能直接推成当前方无强制胜。\n- 唯一防守：每个合法着法逐一证明，恰有一个避免对方接下来1ply强制胜；只证明这一短期范围，不是永久安全。\n- 分歧保存tactical/normal/hard的选择、评价、PV，以及各选择后对手3-ply查询（每次2000节点）；unknown保持未知。\n- Expiry Swing定义为删除使任一方“几何单空格补齐集合”增减；比较落新棋后尚未删的诊断反事实与真实稳定局面，不设任意分数阈值，不把几何变化称为强制胜。\n\n典型ASCII与合法moves见 [P3_POSITIONS.md](P3_POSITIONS.md)，完整分类JSON在 [positions](../positions/expiry-lock.json)。不存在的类别保持0，未补造。\n\n## 4. AI 对照与全部60-ply结果\n\n下表终局长度仅统计非cutoff；胜负长度仅统计真实胜负，均为平均/中位总ply。完整逐局首次删除、删除数、长度与节点见各JSON。\n\n| 批次 | 执行 | 独特 | X/O胜 | 重复/满盘/规则上限 | cutoff | 非cutoff长度均/中位 | 胜负长度均/中位 |\n| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |\n`;
md += batches.map(mrow).join("\n");
md +=
  `\n\n默认规则的AI归因（精确轨迹去重，A/B顺序与表一致）：\n\n| A / B（research） | A/B胜 | 角色归因冲突 | 规则和棋 | cutoff |\n| --- | ---: | ---: | ---: | ---: |\n` +
  batches
    .filter((b) => b.job.rule === "C")
    .map(arow)
    .join("\n");
md += `\n\n这些是有限预算、固定开局、相关配对数据。不能从少量胜负和大量cutoff断言search必然强于tactical或hard必然强于normal；未计算Elo，未进行强求解。\n\n对cutoff比例≥25%的批次，预先定义取最早最多4条不同cutoff轨迹延长到100；相同seed/开局/角色且前60ply必须完全一致。属于条件筛选随访，不与主样本混合，不代表随机cutoff样本。\n\n| 延长批次 | 完成 | 独特 | X/O胜 | 重复/满盘/规则上限 | 仍cutoff |\n| --- | ---: | ---: | ---: | ---: | ---: |\n`;
md += batches
  .map((b) => {
    const m = metrics(b.extension.games),
      c = m.counts;
    return `| ${b.job.id} | ${m.executed} | ${m.uniqueTrajectories} | ${c.X}/${c.O} | ${c.repetition}/${c["no-moves"]}/${c["ply-limit"]} | ${c.cutoff} |`;
  })
  .join("\n");
md +=
  `\n\n## 5. 参数比较与FIFO相关性\n\nA=5×5连4K5，B=6×6连5K5，C=6×6连5K6，D=6×6连5K7，E=7×7连5K6。均用同一引擎、hard/normal研究预算和阶段对应的固定开局生成方法；A/E同时改变棋盘或连线长度，不能把差异只归因于K。\n\n所有比例分母均明确列出。Activation：非cutoff中至少一次删除。已删除开局会使该项偏高，所以另列开局未删除子集，以及由AI继续下棋期间新增删除的比例。胜负后删除比例只在胜负局内计算。至少两次删除对应双方都进入过FIFO阶段（各方同K、合法交替）。变化率是几何补齐集合变化，不是已证战术因果。\n\n| 规则 | Activation | 未删除开局子集Activation | 继续期间新增删除 | 胜局/负局在删除后结束 | 至少2次删除 | 删除改变几何补齐集合 | 首删到终局中位ply |\n| --- | --- | --- | --- | --- | --- | --- | ---: |\n` +
  params.map(paramrow).join("\n");
md +=
  `\n\n| 规则 | 首删ply均/中位（发生者） | 每局删除均/中位（含cutoff） | 非cutoff删除均/中位 | 非cutoff继续行动中位ply |\n| --- | ---: | ---: | ---: | ---: |\n` +
  params
    .map((b) => {
      const m = b.metrics;
      return `| ${b.job.rule} | ${num(m.firstDeletionPly.mean)}/${num(m.firstDeletionPly.median)} | ${num(m.deletionsAll.mean)}/${num(m.deletionsAll.median)} | ${num(m.deletionsNonCutoff.mean)}/${num(m.deletionsNonCutoff.median)} | ${num(m.terminalContinuationLengths.median)} |`;
    })
    .join("\n");
const fastest = [...params]
  .filter((b) => b.metrics.terminalLengths.median !== null)
  .sort(
    (a, b) =>
      a.metrics.terminalLengths.median! - b.metrics.terminalLengths.median!,
  )[0];
const highest = [...params].sort(
  (a, b) => (b.metrics.cutoff.rate ?? 0) - (a.metrics.cutoff.rate ?? 0),
)[0];
md += `\n\n当前实验提示：非cutoff中位总长度最短的是${fastest?.job.rule ?? "无"}，但“太快”是体验偏好，不是数学标签；60-ply截止比例最高的是${highest.job.rule}。大量删除与cutoff说明这些样本在此预算下难以结束，不等于已证明长期循环；仅repetition字段才是规则循环和棋证据。参数是否更合适，应同时查看无删除开局子集、删后长度与cutoff，不能只挑先后手胜率。\n\n## 6. 首着与对称性\n\n6×6首着有6个D4等价类别，合计36格；仅代表点做初步评价和两局角色交换。canonicalPosition只是研究用位置键，不包含重复历史，不用来复用TT分值。完整轨迹规范化用于研究去重，年龄队列顺序不排序。\n\n| 代表(r,c) | 成员坐标 | X静态启发式 | 后续X/O胜、cutoff |\n| --- | --- | ---: | --- |\n`;
md += openingClasses.classes
  .map(
    (c) =>
      `| (${c.representativeCoordinate}) | ${c.coordinates.map((x) => `(${x})`).join(" ")} | ${c.heuristicForX.toFixed(2)} | ${c.outcomes.counts.X}/${c.outcomes.counts.O}, ${c.outcomes.counts.cutoff} |`,
  )
  .join("\n");
md += `\n\n所有响应选择、分数、PV、预算与代表点完整对局见 [first-move-analysis.json](../experiments/results/p3/first-move-analysis.json) / first-moves.json。静态评价为X视角，下一手搜索响应分数为O视角。每类仅2局，不能给首着类别作可靠强弱排名；当前AI的同分落点排序可能有方向偏差。\n\n## 7. 默认规则建议\n\n**目前数据不足以判定6×6/连5/K6优于邻近参数。** 为兼容保持原工程默认及全部原预设；这不是研究认定默认已平衡，也不是因项目叙事强行选优。下一步应在相同阶段分层开局下提高研究预算、延长有条件cutoff观察，再结合人工试玩的节奏偏好比较K5/K6/K7。\n\n## 8. 已证明、观察、启发式与未知\n\n- 已证明：mate-corpus的forced-win与限定范围not-found，及战术库中有证明结果的到期锁/唯一短期防守。仅适用于保存的完整上下文。\n- 实验观察：JSON中的胜负、规则和棋、cutoff、删除、不同轨迹以及有界预算AI选择；不外推理论公平。\n- 启发式：AI评价、几何伪威胁与Expiry Swing、对节奏是否合适的判断。\n- 未知：预算耗尽的mate查询，所有cutoff之后的真实结果，网页完整预算档位的充分棋力比较，默认规则全局解、公平性与最优首着。未进行无限对局、上千局、训练或生产部署。\n\n## 9. 验证与复现\n\n所有JSON均保留完整棋谱或合法局面前缀。报告由 p3:report 从真实文件生成，汇总JSON为 [analysis.json](../experiments/results/p3/analysis.json)。命令与输出目录见 README P3段落。最终单元测试、浏览器测试、类型检查、lint和构建结果见 docs/PROGRESS.md 和 docs/validation/p3-*。\n`;
writeFileSync("docs/P3_REPORT.md", md);
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
