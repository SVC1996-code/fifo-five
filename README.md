# FIFO Five / 时序连子棋

A connect-in-a-row game where stones have an age — and your oldest stone eventually disappears.

一种带有棋子寿命机制的连子棋。每方只能保留有限数量的棋子；放入新棋后，最老的棋子会消失，进攻与防守也随时间变化。

![Classic 主界面](docs/images/classic.png)

## Mini / Classic

| 模式 | 规则 | 体验 |
| --- | --- | --- |
| Mini | 3×3 / 连3 / FIFO K3 | 快速，容易理解寿命机制 |
| Classic | 6×6 / 连5 / FIFO K7 | 当前主要推荐模式，有更多阵型调整、进攻和防守空间 |

其他棋盘大小、连线数量、FIFO 上限和永久棋均在“自定义 / 实验模式”中设置。兼容性引擎默认仍是 6×6 / 连5 / K6。

![Mini 模式](docs/images/mini.png)

## 核心规则

1. 在当前为空的位置落新棋。
2. 超过本方上限时，删除本方最老棋。
3. 删除后，再判断横、竖、斜向连续连线胜负。
4. 不能在本回合即将消失的棋原位置直接续命。
5. 完整状态第三次重复判和，状态包含行动方和双方棋龄顺序。
6. 棋龄也是游戏状态；重复次数通过对局历史重建。

无合法落点也判和；自定义规则可另设手数上限。

## FIFO Five 有什么特别

**相同棋盘占位，仅改变棋龄，就可能改变战术结果。** 防守棋到期可能形成“到期锁”，看似能补齐的连线也可能因自己的老棋消失成为“到期伪威胁”。

![寿命提示与落点预览](docs/images/expiry.png)

## 功能与操作

- 本地双人、人机 AI、自定义规则。
- 黑白棋子、裂纹与“最老 → 最新”队列、落点预览、碎裂和胜负反馈。
- 悔棋、浏览器自动存档、棋谱导入导出与只读回放。
- 点击空格落子；方向键移动焦点，Enter / 空格确认。支持系统减少动态效果。

打开页面直接进入棋盘，有效存档自动恢复。存档不跨设备同步，清除浏览器数据会丢失，请按需导出棋谱。没有联机、账号或服务器。

## 本地运行

需要 Node.js 22.12+（推荐当前 LTS，附带 npm）：

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 ，Ctrl+C 停止。

```sh
npm run build
npm exec vite preview -- --host 127.0.0.1
```

`dist/` 需通过 HTTP(S) 服务访问。尚未部署 GitHub Pages，没有在线游玩地址。

## 技术栈

TypeScript、React、Vite、Web Worker；Vitest 和 Playwright 测试。AI 无模型训练，不调用外部 AI API。Firefox / Safari / 实体手机尚未完整验证。

## Research

FIFO Five includes finite mate-search and reproducible experiments. The research found FIFO-specific tactics such as Expiry Locks and Expiring Threats, and demonstrated that identical board occupancy with different stone ages can produce different tactical outcomes.

Classic 尚未强求解，实验不证明理论公平性。

[Read the research →](docs/RESEARCH.md) · [源码](src/) · [测试](tests/) · [实验工具](experiments/)

## License

当前未设置开源许可证。源码公开不等于已授予复制、修改和分发许可；许可证由项目所有者之后决定。
