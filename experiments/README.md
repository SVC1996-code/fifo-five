# Experiments

研究结论请先读 [FIFO Five Research](../docs/RESEARCH.md)。这里保留复现入口与被测试实际使用的数据；目录名 p2 / p3 是稳定脚本路径，不代表读者需要了解开发阶段。

## 数据保留策略

- `results/p3/analysis.json`：最终汇总，战术明细引用 `positions/`，不再重复内嵌。
- `results/p3/*-normal*.json`、其他配对与延长批次：保留完整棋谱，`tests/p3-artifacts.test.ts` 会逐局重放，不能仅留几个样本。
- `results/p3/mate-corpus.json`、首着结果、执行源码快照：保留有限证明、对称性与复现证据。
- `results/strength-{baseline,current}.json`、`timing-{baseline,current}.json`、`smoke-results.json`：现有测试输入，名称虽旧但并非无用日志。
- `positions/`：保留全部有序棋龄战术及未证明候选；测试会重新验证，不只相信结果标签。
- 早期部分性能输出、浏览器计时输出、可再生汇总与过程 Markdown 已从 main 移除。完整原版在 [v0.1.0](https://github.com/SVC1996-code/fifo-five/tree/v0.1.0)。

## 固定实验

预算和规则在 [p3/config.ts](p3/config.ts)，研究 AI normal=128 节点、hard=960 节点。各规则 20 开局、双角色、双 seed；60-ply 截止包含开局。节点预算不含战术预处理；重复轨迹不作为独立样本，cutoff 不算规则和棋。

七个配对：`C-normal-tactical`、`C-hard-tactical`、`C-hard-normal`、`A-hard-normal`、`B-hard-normal`、`D-hard-normal`、`E-hard-normal`。

每个配对依次执行（替换 job 名）：

```sh
npm run p3:run -- C-normal-tactical
npm run p3:late -- C-normal-tactical
npm run p3:extend -- C-normal-tactical
```

run 执行初批，late 补齐预设开局，extend 在独特 cutoff 比例至少 25% 时选最早最多四条延长到 100 ply。延长是条件随访，不与主样本混合。现存检查点会跳过已完成 ID；要全新重跑，应在单独工作副本中备份并移开对应输出，勿把读取检查点称为重新对局。改变配置须使用新的研究输出目录，不覆盖历史证据。

```sh
npm run p3:run -- first-moves
npm run p3:first
npm run p3:proof
npm run p3:mine
npm run p3:report
```

汇总和挖掘需要全部配对文件；仓库当前已包含。proof、first、mine、report 会更新 JSON，保留比较前的副本。汇总不自动改写人工维护的 RESEARCH。

## 其他工具

`npm run experiment` 是最小批量入口；`p2:strength`、`p2:timing`、`p2:browser-timing` 保留对照与耗时测量能力；`p2:report` 从 strength 数据再生汇总。参数见 [p2/run.ts](p2/run.ts) 与 [p2/browser-timing.ts](p2/browser-timing.ts)。未使用的旧 Markdown 报告生成器已删除。

这些脚本不训练模型、不使用外部 AI API。计时结果受机器与负载影响，不能把一次运行称为稳定性能。
