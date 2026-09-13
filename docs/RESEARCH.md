# FIFO Five Research

## 1. 为什么会有 FIFO Five

普通连子棋中的棋子永久存在。FIFO Five 给棋子加入年龄：每方只能保留 K 枚，落入新棋后删除最老棋，删除之后才判断胜负。因此位置之外又增加了时间维度：阵型会过期，防守也有寿命。

本项目研究和实现这一具体规则体系，并不声称首创所有“棋子消失”机制。

## 2. 推荐模式

**Mini：3×3 / 连3 / K3。** 节奏快，FIFO 很快进入，适合理解机制。

**Classic：6×6 / 连5 / K7。** 当前人工试玩更偏好 K7：有更多机动棋，可以进攻、防守和转移阵型。这是产品推荐，不代表数学上最优。早期主要研究参数 K6 仍可通过自定义使用，也仍是兼容性引擎默认。本次文档整理没有改动任何游戏行为。

## 3. FIFO 特有战术

### Expiry Lock / 到期锁

关键防守棋即将删除，使对手随后强制获胜。检测器先找队首作为关键几何阻挡的候选，再用完整两 ply 搜索验证；未完成证明的候选不计入已证锁。

### Expiring Threat / 到期伪威胁

表面可补齐的攻击线，因为下一步删除本方关键老棋而失效。此判断针对某条线路；可能还有其他获胜线，不能直接推成当前方没有任何强制胜。

### Age-sensitive Position / 棋龄敏感局面

**相同棋盘占位，仅仅改变棋子的年龄顺序，就可能改变有限强制杀搜索的结论。** 棋盘快照不足以描述局面；权威输入必须是可合法重放的 moves，包含规则和重复历史。

下面精选三个实验发现及一组棋龄对照。X / O 是研究记号，数字 1 表示最老；落点按 `row * boardSize + column` 编号，坐标从 0 开始。前三例均为 6×6 / 连5 / K6。

#### expiry-lock：合法实验样例

Moves: [14,15,20,21,26,8,27,29,1,6,25,24,7,19,4,18,12,20,21,14,8,9,1,15,25,13,16,27,4,3]

```text
.  X3 .  O6 X6 .
.  .  X2 O2 .  .
.  O4 O1 O3 X5 .
.  .  .  X1 .  .
.  X4 .  O5 .  .
.  .  .  .  .  .
```

详情见 [expiry-lock.json](../positions/expiry-lock.json)，id=29e0b14061102fa421b3ea4398511dc7e2a769b02c98bf168231c0acc31278c3。


#### expiring-threat：合法实验样例

Moves: [14,15,20,8,21,22,28,1,29,7,25,10,26,27,11,6,17,9,8,20,23,34,13,15,29,21]

```text
.  .  .  .  .  .
O1 .  X3 O2 .  X1
.  X5 .  O5 .  X2
.  .  O3 O6 .  X4
.  .  .  .  .  X6
.  .  .  .  O4 .
```

详情见 [expiring-threat.json](../positions/expiring-threat.json)，id=03d53b4f7882a83b6951a6206c30a08b2abcd204e8d4191960d6983d46b6429a。


#### unique-defense：合法实验样例

Moves: [14,15,20,8,21,22,28,1]

```text
.  O4 .  .  .  .
.  .  O2 .  .  .
.  .  X1 O1 .  .
.  .  X2 X3 O3 .
.  .  .  .  X4 .
.  .  .  .  .  .
```

详情见 [unique-defense.json](../positions/unique-defense.json)，id=fc7cd16b514c914aa11bd90a7fa0e8492912ac8830f4f1d3fcaf6855a51d6dd5。


#### 同占位、不同棋龄：合法参考对照

**defender-expiry-mate3**（6×6 / 连5 / K6，攻击方 X）：三 ply forced-win。

Moves: `[0,14,2,35,12,30,13,32,15,6,16,8]`

**same-occupancy-different-age**（6×6 / 连5 / K6，攻击方 X）：三 ply not-found。

Moves: `[0,35,2,14,12,30,13,32,15,6,16,8]`



唯一防守只证明恰有一步避免对手下一 ply 获胜，不表示永久安全。搜索分歧记录 tactical / normal / hard 的落点、评价、PV 和后续三 ply 验证；预算耗尽仍记 unknown。Expiry Swing 定义为一次删除改变任一方的“几何单空格补齐集合”，不使用任意分数阈值，也不把几何变化当作强制胜。

## 4. 有限强制杀搜索

独立 [AND/OR mate search](../src/research/mate.ts) 通过真实引擎转移，保留 FIFO 棋龄、删除、重复历史、规则手数上限与禁止原地续命。攻击方寻找一条成功选择，对方必须在所有合法防守下仍失败，才能给出强制胜证明。

N ply 指从当前状态开始**双方合计的后续原子行动数**，不是攻击方走 N 手。支持 1 / 3 / 5 / 7，也允许 0～7 便于终局和防守方先行查询。

| 返回 | 含义 |
| --- | --- |
| forced-win | 存在抵御全部合法防守的有限获胜策略 |
| not-found | 已证明给定深度以内不存在该方强制胜；不表示全局和棋 |
| unknown | 节点或时间预算不足，未完成证明；不能当成无杀或和棋 |

`distance` 是已证策略最坏分支的距离上界，不保证最短。PV 只展示一个代表分支，不是整棵证明树。

[Mate corpus](../experiments/results/p3/mate-corpus.json) 保存 9 个合法参考/回归局面的 45 次查询，每次最多 50,000 节点：17 forced-win、24 not-found、4 unknown。已证普通直接五连、三 ply 叉杀、防守棋到期的三 ply 杀、已有到期锁（防守方先动，两总 ply），以及三乘三的五 ply 叉杀。棋龄对照在三 ply 内结论不同；更深查询可能仍未知。

## 5. AI

Tactical AI 做精确短期胜负与防守检查；Search 使用 Alpha-Beta、iterative deepening 和 FIFO-aware evaluation。网页通过 Web Worker 搜索及取消任务。没有模型训练或外部 AI API。

研究 normal 使用 128 节点 / 最大深度 5，hard 使用 960 节点 / 最大深度 8，无时间截止。战术预处理不计入此搜索节点预算。网页对应档位为 8,000 / 60,000 节点，不能把低预算研究直接外推为完整产品棋力。

K6 的 60-ply 配对实验（按完整轨迹去重）：

| A / B | A胜 / B胜 | 规则和棋 | cutoff |
| --- | ---: | ---: | ---: |
| normal / tactical | 5 / 1 | 0 | 32 |
| hard / tactical | 11 / 4 | 0 | 23 |
| hard / normal | 8 / 3 | 0 | 27 |

当前观察倾向 search 和更高预算，但少量胜负与大量 cutoff 不足以断言必然更强；没有计算 Elo。

## 6. 参数研究

各配对使用 20 个合法开局，涵盖空盘、中心、边角、FIFO 前后与棋龄压力；交换执子角色，使用两枚固定 seed。研究 AI 的同分排序是确定性的，seed 经常产生重复轨迹。

以下为 hard / normal 在 60 总 ply 截止下的精确独特轨迹。长度只统计非 cutoff，FIFO activation 分母亦仅为非 cutoff。

| 规则 | 独特轨迹 | X / O胜 | cutoff | 终局中位 ply | FIFO activation |
| --- | ---: | ---: | ---: | ---: | ---: |
| A：5×5 / 连4 / K5 | 34 | 17 / 16 | 1 | 23 | 29/33 |
| B：6×6 / 连5 / K5 | 38 | 0 / 5 | 33 | 54 | 5/5 |
| C：6×6 / 连5 / K6 | 38 | 8 / 3 | 27 | 42 | 11/11 |
| D：6×6 / 连5 / K7 | 38 | 11 / 6 | 21 | 43 | 17/17 |
| E：7×7 / 连5 / K6 | 40 | 8 / 6 | 26 | 32.5 | 14/14 |

这些批次没有三次重复、无合法落点或规则手数上限和棋；cutoff 单独记录，绝不算和棋。A 节奏较快；B 在此低预算下很难收束。K6 和 K7 大量进入 FIFO，但不能把 cutoff 当作已证循环。

Activation 是至少发生一次删除的非 cutoff 比例。预设已有删除的开局会抬高此值，所以汇总也包含“开局尚未删除”分层：A 为 15/19、B 为 3/3、C 为 6/6、D 为 9/9、E 为 7/7。另统计至少两次删除、删除到终局长度及几何补齐集合变化。这些指标帮助判断机制是否参与对局，不是删除作用的因果证明。

**实验结果 ≠ 理论证明。** A/E 同时改变棋盘或连线长度；相同节点预算也不代表相同搜索深度。当前数据不足以认定最优 K。保留 Classic K7 的产品推荐依据是人工试玩偏好与更多“闪转腾挪”的空间，非数学选优。

## 7. 研究规模

[机器汇总](../experiments/results/p3/analysis.json) 记录 **596 局实际执行、298 条精确独特轨迹、10,491 个合法前缀扫描**。其中 560 局主对照/补齐、24 局条件延长到 100 ply、12 局首着代表实验。完整轨迹以规则和 moves 哈希去重；不同轨迹仍可能共享前缀，不保证统计独立。100-ply 延长与其 60-ply 前缀也不是额外独立证据。

| 类型 | 实验发现 | 参考样例 | 战术库总数 |
| --- | ---: | ---: | ---: |
| Expiry Lock | 73 | 1 | 74 |
| Expiring Threat | 189 | 1 | 190 |
| Unique Defense | 184 | 0 | 184 |
| Search Disagreement | 28 | 2 | 30 |
| Expiry Swing | 592 | 3 | 595 |

检测数量不是独立局面概率；搜索分歧仅按固定规则采样。[positions](../positions/) 保存合法 moves 和验证结果，未证锁候选另存。

6×6 首着按旋转/镜像归为六个等价类别，而非 36 个独立问题。[首着分析](../experiments/results/p3/first-move-analysis.json) 保存类别、评价、PV 和后续结果。每类仅两局，不能可靠排名；研究 canonical position 不包含重复历史，不用于 TT 分值复用。

## 8. 已知与未知

### Proven in bounded searches

保存的完整上下文中，forced-win 与指定范围的 not-found，以及已证到期锁、唯一短期防守。不是从空盘的全局求解。

### Experimental observations

已执行 AI 对局中的胜负、规则和棋、cutoff、删除、轨迹和参数节奏；仅适用于所用开局与预算。

### Heuristics

FIFO 评价函数、几何伪威胁、Expiry Swing、人工节奏偏好。启发式分数不是胜率。

### Unknown

Classic 的全局解、理论公平性、最优首着、最优 K、所有 cutoff 后的真实结果、预算耗尽的 mate 查询、完整产品 AI 的精确棋力。Firefox / Safari / 实体手机也仍未完整验证。

## 9. Reproduction

```sh
npm ci
npm exec playwright install chromium
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

主要研究入口：

```sh
npm run p3:proof
npm run p3:report
npm run p3:mine
```

`proof` 重算参考证明；`report` 从完整 JSON 重算机器汇总；`mine` 从合法棋谱重建战术库。它们不会生成过程 Markdown 或覆盖本文，可能更新机器结果中的运行时间。

完整批次仍保留，因为测试逐局校验棋谱与删除统计。预算、种子、开局和执行顺序见 [实验说明](../experiments/README.md)。本轮仅整理既有资料，没有重新执行大规模对局或声称新增棋力结论。
