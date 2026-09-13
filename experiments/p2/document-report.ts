import { readFileSync, writeFileSync } from "node:fs";
interface Stat {
  samples: number;
  median: number;
  p95: number;
  max: number;
}
interface Group {
  scenario: string;
  difficulty?: string;
  total: Stat;
  tactical: Stat;
  search: Stat;
  roundTrip?: Stat;
}
interface Timing {
  complete: boolean;
  sampleCount: number;
  environment: {
    node: string;
    cpu: string;
    platform?: string;
    release?: string;
    os?: string;
    browser?: string;
  };
  groups: Group[];
}
interface Counts {
  agentAWin: number;
  agentBWin: number;
  repetition: number;
  "no-moves": number;
  "ply-limit": number;
  cutoff: number;
}
interface Analysis {
  completedExecutions: number;
  globalUniqueTrajectories: number;
  current: {
    completed: number;
    uniqueTrajectories: number;
    summaries: {
      pair: string[];
      completed: number;
      uniqueTrajectories: number;
      all: Counts;
      deduplicated: Counts;
    }[];
  };
  baseline: { completed: number };
  pairedBeforeAfter: { sameTrajectory: boolean; sameDecisions: boolean }[];
  tacticalAudit: { beforeMistakes: number; afterMistakes: number };
}
const read = (file: string) =>
  JSON.parse(readFileSync(`experiments/results/${file}.json`, "utf8"));
const before: Timing = read("timing-baseline"),
  after: Timing = read("timing-current"),
  browser: Timing = read("timing-browser"),
  analysis: Analysis = read("p2-analysis");
if (!before.complete || !after.complete || !browser.complete)
  throw Error("不能发布未完成测量的最终报告");
const fmt = (s: Stat) =>
  `${s.median.toFixed(1)} / ${s.p95.toFixed(1)} / ${s.max.toFixed(1)}`;
const strength = analysis.current.summaries
  .map(
    (g) =>
      `| ${g.pair.join(" 对 ")} | ${g.completed} | ${g.uniqueTrajectories} | ${g.all.agentAWin} / ${g.all.agentBWin} | ${g.all.repetition + g.all["no-moves"] + g.all["ply-limit"]} | ${g.all.cutoff} |`,
  )
  .join("\n");
const nodeTable = after.groups
  .map(
    (g, i) =>
      `| ${g.scenario} | ${g.total.samples} | ${fmt(before.groups[i].total)} | ${fmt(g.tactical)} | ${fmt(g.search)} | ${fmt(g.total)} |`,
  )
  .join("\n");
const browserTable = browser.groups
  .map(
    (g) =>
      `| ${g.scenario} / ${g.difficulty} | ${g.total.samples} | ${fmt(g.tactical)} | ${fmt(g.search)} | ${fmt(g.total)} | ${fmt(g.roundTrip!)} |`,
  )
  .join("\n");
const text = `# P2 体验与棋力验收（2026-09-13）

## 执行与范围

保留默认 6×6 / 连至少五枚 / FIFO 六枚、先落后删再判胜、禁止原地续命及包含棋龄的三次重复规则。没有重写引擎，没有联机、账号、排行榜、训练、外部 API、推送或部署。

本轮增加固定开局的棋力对照、分阶段真实耗时观测、排序评价缓存优化、本地自动存档，以及对应回归和浏览器测试。

## 棋力小样本

运行环境：${after.environment.node}，${after.environment.platform} ${after.environment.release}，${after.environment.cpu}。所有棋力对照 timeMs=null；正常 8000 节点/最大深度5，困难 60000节点/最大深度8；战术预处理单独计数。3 个预先固定的合法开局，每个使用 seed=20260913 并交换 AI 的 X/O 角色；截至包含开局的第24手。完整配置、开局、预算、每步诊断和全棋谱均在原始 JSON 中。

| 当前版本配对（A 对 B） | 完成局数 | 独特轨迹 | A胜 / B胜 | 规则和棋 | cutoff |
| --- | ---: | ---: | ---: | ---: | ---: |
${strength}

当前版本共 ${analysis.current.completed} 局、${analysis.current.uniqueTrajectories} 条独特轨迹；修改前基线额外完成 ${analysis.baseline.completed} 局。合计实际完成 ${analysis.completedExecutions} 局执行，跨版本全局去重后 ${analysis.globalUniqueTrajectories} 条轨迹。重复确定性棋谱不是额外独立样本；同开局交换角色有相关性，不同轨迹也不保证统计独立。这里只做精确棋谱去重，不合并旋转/镜像等价轨迹。规则重复、无合法着法、规则上限与 cutoff 在 JSON 中分别计数。

基线原计划还运行困难对正常，因原实现计算成本高而中止了在途局；未完成的局不计入统计，保留 complete:false、停止原因和六局完整记录。修改前后的同一 search/tactical 六局共同集合有 ${analysis.pairedBeforeAfter.filter((g) => g.sameTrajectory).length} 局棋谱一致、${analysis.pairedBeforeAfter.filter((g) => g.sameDecisions).length} 局逐手诊断（不含耗时/版本）一致。没有完成困难对正常的完整修改前后对局比较，不能声称该对照也相同。

本轮结果不支持宣称困难档必然更强，也不能推导公平性或强求解。24手 cutoff 偏短，多数未结束局面没有判定胜负；未进行置信区间、Elo 或大样本胜率估计。

## 战术审计与修改

对实验产生的每一手进行完整真实状态转移审计：有稳定一手胜时是否漏选；没有一手胜但存在安全回复时是否送对手一手胜。修改前发现 ${analysis.tacticalAudit.beforeMistakes} 个、修改后发现 ${analysis.tacticalAudit.afterMistakes} 个该范围错误。未发现的新错误不会虚构为回归样例；保留原到期锁/反例等战术测试，并增加六种局面的运行时基线对照及全部观测样本的行为回归。没有对所有对局进行多手杀棋穷举审查，落败不自动等同于已证明的战术 bug。

测量先显示搜索占主要时间；检查发现 Array.sort 比较器重复评价同一候选。唯一棋力模块优化：将候选排序分数在该节点预计算一次，再按原数值/稳定顺序排序。保留原评价公式、全宽战术、搜索预算、重复上下文和仅用于排序的 TT。版本从 fifo-ab-1 变为 fifo-ab-1-order-cache，冻结基线代码在 experiments/p2/baseline-ai.ts。18个配对观测的着法、PV、分数、节点、完成深度一致；这提供行为保持证据，不是棋力提升证据。

## Node 固定节点耗时

基线最初额外运行了3次默认6×6空盘/8000节点，总耗时分别为 7884.2、8781.5、10064.7 ms（原始部分文件保留）。随后为限制测量成本，将对比探针预先统一为500搜索节点、最大深度8、timeMs=null；6种局面 × 3次 = 每版本18次，共36次配对观测。每格先做一次100节点热身，不计入样本。

下表每格为 **中位 / P95 / 最大**，单位 ms。P95 使用 nearest-rank；每格只有3次，所以 P95 等于最大。两版本串行批次执行，基线先、当前后；没有随机交错顺序，JIT、温度、功耗和系统背景负载可能影响结果。没有与本项目棋力批次或测试并发运行这些 Node 探针。

| 局面 | 每版样本 | 修改前总耗时 | 修改后战术 | 修改后搜索 | 修改后总耗时 |
| --- | ---: | ---: | ---: | ---: | ---: |
${nodeTable}

全部样本保存各阶段耗时、搜索/战术节点、实际完成深度与预算。这里的500节点探针用于定位和比较，不代表网页困难档完整预算的耗时。观测到耗时下降，但样本不足，不能宣称稳定的速度提升倍数或跨设备性能。

## 真实浏览器 Worker 耗时

${browser.environment.browser} Chromium headless，${browser.environment.node}，${browser.environment.os}，${browser.environment.cpu}。6种局面 × 正常/困难 × 3次，共 ${browser.sampleCount} 次。使用网页实际预算：正常500ms/8000节点，困难1800ms/60000节点；每次新建真实 Worker，不热身。这里的墙钟截止会改变实际搜索量，因此只作为体验测量，不用于确定性棋力对照。

下表同为中位/P95/最大 ms。Worker 内总耗时=战术预处理+搜索；往返另含 Worker 启动、消息克隆与开发模块加载。战术预处理不受搜索预算硬截止约束，搜索的时间检查也不是操作系统实时保证。测量在棋力进程结束后执行，未并行本项目其他计算任务。

| 局面 / 难度 | 样本 | 战术 | 搜索 | Worker内总耗时 | 往返 |
| --- | ---: | ---: | ---: | ---: | ---: |
${browserTable}

每格3次同样不足以估计稳定尾延迟。使用 Vite 开发服务，不代表生产托管网络、移动设备、Firefox 或 Safari 的性能。

## 本地自动存档

新增 src/storage.ts，存储版本与棋谱版本分别校验；保存已生效的规则、从开局的 moves、对战方式、执子、难度、棋龄显示。恢复不信任棋盘快照或 winner；调用 importRecord 与 replay 重建棋龄、重复计数和终局状态。

有存档或读取错误时先显示选择页，用户确认前不写入、不发起 AI。继续后若轮到电脑则新建 Worker 重算；电脑思考中刷新会恢复到上一个已完成的原子行动。回放不覆盖正在玩的存档。损坏、版本不兼容、无存储权限或配额不足均有中文提示，写失败不阻止下棋，建议导出备份。只读回放不保存临时棋龄显示修改；返回对局后才更新设置。

存储仅限当前浏览器源；不同端口/域名不共享。没有跨标签页冲突合并，最后写入生效；未验证浏览器进程被强制终止或系统断电时的持久化时机。

## 原始证据与复现

- [棋力汇总与去重、共同测试集对照](../experiments/results/p2-analysis.json)
- [当前完整12局](../experiments/results/strength-current.json) / [基线已完成6局及停止原因](../experiments/results/strength-baseline.json)
- [Node基线](../experiments/results/timing-baseline.json) / [Node优化后](../experiments/results/timing-current.json) / [初始8000节点部分观测](../experiments/results/timing-baseline-full-partial.json)
- [真实浏览器全部观测](../experiments/results/timing-browser.json)
- [战术审计发现列表](../experiments/results/tactical-findings.json)

运行命令见 README 的 P2 段落。最终单元测试、浏览器测试、类型检查、lint 和构建结果见 docs/PROGRESS.md 与 docs/validation/p2-* 日志。
`;
writeFileSync("docs/P2_REPORT.md", text);
