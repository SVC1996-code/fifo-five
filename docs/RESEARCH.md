# 研究工具复现

## P3：有限战术证明与参数研究

本阶段保持产品UI、原AI与Worker不变。新模块：`src/research/mate.ts`（有限强制胜）、`mining.ts`（FIFO战术）、`symmetry.ts`（D4研究去重）；工具位于 `experiments/p3/`。

`proveMate(state, {maxPly,maxNodes,timeMs,attacker?})` 默认以当前行动方为攻击方。N指双方合计的后续原子行动数，支持1/3/5/7，另允许0～7便于已有终局和防守方先动的查询。`forced-win`为有证明的有限强制胜，distance是已找到策略的最坏距离上界，不保证最短；`not-found`仅否定指定范围；`unknown`表示预算不足。全部真实行动经过原引擎，携带重复历史，不使用有风险的分值TT。

研究档 `normal`=128节点/最大深度5，`hard`=960节点/最大深度8，`timeMs:null`，保留1:7.5的预算比例。这些是低成本研究预算，不等同网页8000/60000节点完整档位；不能直接外推网页棋力。配置、两枚seed、20个开局生成方法、60/100截止规则见 `experiments/p3/config.ts`。

示例（在项目目录运行；不要同时重复运行同一个job）：

```powershell
npm run p3:proof
npm run p3:run -- C-normal-tactical
npm run p3:late -- C-normal-tactical
npm run p3:extend -- C-normal-tactical
```

七个job为 `C-normal-tactical`、`C-hard-tactical`、`C-hard-normal`、`A-hard-normal`、`B-hard-normal`、`D-hard-normal`、`E-hard-normal`。每个job先run达到首批数量，再late补齐剩余预设开局，最后extend：若独特轨迹cutoff比例≥25%，取最早最多4条独特cutoff到100ply，单独记录。完整输出已有检查点时会跳过已执行ID；配置改变时不要覆盖历史研究文件，应创建新的研究版本/输出目录。

全部job完成后：

```powershell
npm run p3:run -- first-moves
npm run p3:first
npm run p3:mine
npm run p3:report
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

原始对局及逐手诊断在 `experiments/results/p3/`；战术库在 `positions/`，保存全部已检测记录及合法完整moves，搜索分歧按固定规则采样。人读样例见 [P3_POSITIONS.md](P3_POSITIONS.md)。所有结论、独特轨迹、FIFO指标分母、限定证明和未知项见 [P3_REPORT.md](P3_REPORT.md)。不要将cutoff当和棋，也不要将已有删除的开局自动带来的Activation当作机制有效的因果证据；报告额外按无删除开局分层。


