# BBGDDG

中文深色 PDF 阅读与研究工作台。把文献、高亮、注释、Markdown 笔记和 AI 对话放在同一个本地工作区。

当前版本：**1.2.0**。本项目基于 [PDFPal](https://github.com/andrepaim/pdfpal) 独立发展，保留上游作者与提交历史，不代表 PDFPal 官方版本。来源与许可见 [NOTICE.md](NOTICE.md)。

## 1.2.0 阅读与笔记工作流

- 首页按项目组织，提供最近项目和紧凑 AI 入口；项目内保留文件夹和子文件夹。
- 项目笔记与文献笔记分组，阅读与独立复习页共用同一份笔记。
- AI / 笔记标签切换、收起到边栏，草稿保存在当前浏览器会话中；笔记需点击保存。
- 原文笔记保存 PDF 页序号、选区坐标及文件内容标识；点击跳转并临时标亮。
- AI 回答可摘入笔记草稿，支持编辑、标签、Markdown 和公式。
- 手机采用工具抽屉，平板支持分屏。当前仍需桌面本机服务；尚非 iOS 独立应用，未提供跨设备同步。iPhone / iPad 为移动版优先平台，见 [移动路线图](docs/MOBILE-IOS.md)。

## 功能

- 中文深色主页与阅读页，项目管理、本地 PDF 导入、中文字体资源和阅读进度。
- 阅读页支持“收起顶部 / 展开顶部”，收起后保留标题、返回项目、AI 切换和设置；本机记住选择，重新打开软件后仍然有效。
- 问答范围可选“选中文字 / 当前 PDF / 项目文献”，每条回答保留当时范围。
- 文献和项目分别保存长期记忆：较早对话自动摘要，支持编辑、清空和暂停自动整理。自动摘要会额外调用所选 AI，消耗用量；摘要与最近 5 轮对话一同用于后续回答。
- 回答中的有效编号引用可跳到真实文献页，匹配文字临时标亮 8 秒；未知引用不会生成跳转。展开“参考片段”可核实原文，片段不代表模型已正确引用。
- 按文字位置保存高亮，支持取消高亮、编辑注释和删除；项目与文献笔记支持 Markdown 和公式。
- 主页与阅读页共用 AI 选择：可用工具亮显，未安装或未配置工具变浅。
- Codex、Claude Code、OpenCode、DeepSeek Harness 和可配置的 WorkBuddy 适配器。
- DeepSeek API、OpenAI 兼容 API 和 Claude API；后端加密保存 API 密钥。
- 记录模型返回的 token 用量和本地累计统计；这些数值不是订阅账号的剩余额度。
- Windows 安装与便携版；本地会话鉴权、渲染隔离和系统密钥保护。

阅读、笔记与高亮不需要 AI 账号。AI 问答使用已有工具登录或自填 API，仍受服务商的费用及用量限制。云端问答会发送文献提取文字，详见 [SECURITY.md](SECURITY.md)。

## 从源码启动

建议使用 **Node.js 24 LTS** 和 npm。桌面构建当前面向 Windows x64。

```sh
npm ci
npm run build
npm start
```

应用只监听本机，启动时打开带本次授权的页面；若没有自动打开，使用终端显示的启动链接。链接中的会话口令应当保密。

开发服务：`npm run dev`；不打开浏览器：`node dist/cli/index.js serve --no-open`。

先新建项目，再“添加文献 → 本地 PDF”。主页或阅读页的“AI 设置”可配置命令行、接口地址、模型及密钥。

WorkBuddy 桌面客户端不等于已提供可直接问答的命令行，需要填写实际可用的命令和参数；不会自动改用 CodeBuddy。DeepSeek Harness 使用 `dsh` headless 配置，认证与工具权限由 Harness 管理。

## Windows 桌面构建

使用同一个 Node 24 环境安装根目录与桌面依赖，避免 SQLite 原生模块 ABI 不匹配。

```sh
npm ci
npm run build
cd desktop
npm ci
npm run prepare:runtime
npm run package
```

产物写入项目根目录 `release/`。构建需联网下载依赖、Electron、Node 许可及 Windows 资源编辑工具。发行包自带运行环境，使用时无需安装 Node。当前没有发布者数字签名。

桌面数据：`%APPDATA%/BBGDDG/data`；密钥保护文件：`%APPDATA%/BBGDDG/ai-secret-key.bin`。安装版与便携版共享工作区，卸载保留数据。原 PDFPal 数据不会自动导入或覆盖，可重新导入原 PDF，或另行进行带备份的数据迁移。

## 命令行与配置

```sh
node dist/cli/index.js --json project create "我的研究"
node dist/cli/index.js source add "我的研究" "/absolute/path/paper.pdf"
node dist/cli/index.js note create "我的研究" -t "读书笔记" -c "我的理解"
```

本地执行 `npm link` 后命令名为 `bbgddg`。本项目尚未发布到 npm，请勿把同名第三方包视为本项目。

CLI 默认目录为 `~/.bbgddg`。支持 `BBGDDG_DATA_DIR`、`BBGDDG_DB`、`BBGDDG_PORT`、`BBGDDG_AGENT`、`BBGDDG_MODEL`；工具路径支持 `CLAUDE_BIN`、`CODEX_BIN`、`OPENCODE_BIN`。更多命令见 [CLI skill](skills/bbgddg-cli/SKILL.md)，示例见 [.env.example](.env.example)。应用不会自动读取 .env 文件。

## 验证与贡献

```sh
npm run typecheck
npm test
npm run test:security
npm run build
cd frontend
npx playwright install chromium
npx playwright test
```

Windows 原生测试见 [desktop/README.md](desktop/README.md)。测试使用临时数据与模拟接口，不消耗真实 API 用量。

结构：src/core 为共享服务，src/server 为本机 API，src/cli 为命令行，frontend 为 React 界面，desktop 为 Electron。参见 [贡献说明](CONTRIBUTING.md) 与 [发布检查](docs/RELEASING.md)。

## 许可与致谢

新增改动采用 MIT，见 [LICENSE](LICENSE)。上游 package.json 声明 MIT，但没有独立 LICENSE；该事实和作者 Andre Paim Lemos 的来源记录保留在 [NOTICE.md](NOTICE.md)。第三方组件保留各自许可。源码不包含个人文献、数据库或凭据。
