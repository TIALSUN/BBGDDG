# 来源与许可记录

BBGDDG 是 PDFPal 的独立衍生项目。重构和改名不消除原版权。本项目不声称代码全部原创，也不代表上游作者背书。

- 上游：https://github.com/andrepaim/pdfpal
- 原作者：Andre Paim Lemos（Git 提交署名）及 PDFPal contributors。
- 上游基线：3d415ee（Persist PDF reading progress）。完整历史随 Git 仓库保留。
- 独立项目的前身：PDFPal 本地改版 2.1.1，67c4fcf。
- BBGDDG 独立版本：1.0.0。

## 许可证据

上游基线 package.json 声明 MIT。2026-10-02 核对的公开上游元数据同样声明 MIT，但仓库没有独立 LICENSE。BBGDDG 的 LICENSE 补充标准 MIT 正文，保留可核实的原作者归属并注明新增改动贡献者；不声称上游提供过这份版权正文。

请保留本文件、LICENSE 和 Git 作者记录。对外发布前如需消除上游许可正文缺失的疑义，应向上游作者确认。本次仅整理本地项目，没有发布或替用户联系作者。

## 改动与依赖

本地改动包括中文深色阅读工作区、PDF 导入与字体资源、高亮注释、笔记、Windows 打包、多 AI 命令行适配、API 设置及用量、本地鉴权与系统密钥保护。BBGDDG 具有独立软件名称、CLI、应用标识和数据目录。个人数据不属于源码。

Node.js、Electron/Chromium、Fastify、React、PDF.js、SQLite 绑定等遵循各自许可。依赖中保留各自许可，桌面包包含第三方通知、Node 许可与 Electron/Chromium 通知。项目 LICENSE 不替代第三方许可。历史截图与测试夹具亦来自上游，仍保留来源。
