# 首次发布检查

本文件记录发布准备与验证，不把本地提交等同于 GitHub 上传成功。远程提交和 v0.1.0 标签以 GitHub 实际内容为准。

## 内容审查

- 重写 README：简介、Mini / Classic、核心 FIFO 规则、状态与限制、启动、研究链接、许可证状态。
- Classic / Mini / 到期前后四张真实游戏截图保存于 images/，README 展示三张。无本机路径、开发工具窗口或私人信息。
- 清理公开文档和历史日志中的本机工作目录，以 `.` 代替；仅脱敏路径，不改测试结果或实验数据。
- 保留 P2/P3 报告、完整棋谱、战术库、源代码对照和验证日志；最大的研究文件约 3.9 MB，全部待提交内容约 25 MB，无需丢弃研究证据。
- `.gitignore` 排除依赖、构建产物、浏览器/测试缓存、本地发布工具、临时文件、环境变量文件和机器私有配置。ESLint 同样忽略未提交的本地发布工具。
- 关键字及文件名审查未发现 API 密钥、token、cookie、私钥或账号私密配置；此结论是本轮检查结果，不是对所有潜在秘密的数学保证。
- 没有自行添加 LICENSE；源码公开不等于授予开源许可。

## 验证

发布前重新实际运行五项命令，全部通过后才允许提交与上传。最终日志见 validation/release-*.log。

首次 lint 曾扫描到本地发布辅助脚本，已补充忽略规则。随后一次浏览器测试因本地 Vite 启动超时未执行；单独确认本项目 Vite 成功启动后，使用已有本地服务器再完整重跑五项命令。失败尝试没有被当作通过。

未配置 GitHub Pages、CI 发布流程或任何网站部署。

最终重跑结果（全部退出 0）：

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| npm test | 11 文件 / 100 测试通过 | [unit](validation/release-unit.log) |
| npm run test:e2e | 23 Chromium 测试通过，35.9 秒 | [e2e](validation/release-e2e.log) |
| npm run typecheck | 通过 | [typecheck](validation/release-typecheck.log) |
| npm run lint | 通过 | [lint](validation/release-lint.log) |
| npm run build | 通过 | [build](validation/release-build.log) |

全部公开 Markdown 本地链接存在，未发现残留本机绝对路径。实际依赖下载缓存与截图工具留在本机，研究证据全部保留。
