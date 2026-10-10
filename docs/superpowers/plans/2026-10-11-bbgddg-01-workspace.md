# BBGDDG 整体界面与导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一中文深色研究工作台，打通项目、阅读、笔记与 AI 流程，适配 iPad 窗口。

**Architecture:** 保留现有 React 路由和后端服务，逐页替换界面组合。抽出共享导航、交互组件和阅读布局状态；不改写 PDF 渲染引擎或现有文献数据。

**Tech Stack:** React 19、TypeScript、现有 CSS、react-pdf、Fastify、Playwright。首轮不引入 UI 框架。

**Spec:** `docs/superpowers/specs/2026-10-11-bbgddg-ui-ipad-design.md`

## Global Constraints

- 保持中文深色风格，兼顾 Windows 桌面、iPad 横竖屏与系统分屏。
- 保留现有文献、笔记、标注、阅读进度和 AI 配置。
- 背景 #15171C，面板 #1D2027，边框 #343944，强调色 #788BEA，正文 #EDF0F7，辅助文字 #ABB3C3。
- 间距采用 4 / 8 / 12 / 16 / 24 / 32 像素尺度；圆角随组件层级区分。
- 触控目标至少 44 × 44 CSS 像素；尊重减少动态效果设置。
- 文字笔记继续明确点击保存。
- 当前产品依赖 Windows 本机服务。
- 每个任务通过相关验证后本地提交并推送 origin；只提交源码、文档与测试。

## Review Focus

- 长中文标题、空列表、请求失败时布局及恢复动作可用：任务 1、2。
- 当前焦点所在的抽屉关闭后，焦点回到触发按钮：任务 1、3。
- 旋转、窄分屏及软键盘出现时保留草稿和阅读位置：任务 3、4。
- 对话生成中切换工具不会重新发送请求或丢失回答：任务 3、5。
- 旧链接和已有阅读偏好继续有效：任务 2、3。

## 文件边界

新建 `frontend/src/components/ui/` 存放 Button、Dialog、Drawer、Icon；`frontend/src/components/WorkspaceShell.tsx` 仅负责导航壳；`frontend/src/styles/tokens.css` 和 `workspace-shell.css` 负责共享视觉。现有 `WorkspaceUI.tsx` 保留 Brand、ColorPicker 的兼容导出。

修改 `LibraryPage.tsx`、`ProjectWorkspace.tsx`、`ReaderPage.tsx`、`NoteWorkbench.tsx`、`ProjectNotes.tsx`、`AiControlPanel.tsx`、`SettingsPage.tsx`。旧 `App.tsx` 不在活动路由中，不为重构它额外扩大范围。

## Task 1: 共享组件与导航壳

**Files:** 新建 `frontend/src/components/ui/{Button,Dialog,Drawer,Icon}.tsx`、`frontend/src/components/WorkspaceShell.tsx`、`frontend/src/styles/{tokens,workspace-shell}.css`；修改 `frontend/src/main.tsx`、`frontend/src/components/WorkspaceUI.tsx`；测试 `frontend/e2e/workspace-ui.spec.ts`。

**Interfaces:** `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'primary'|'secondary'|'danger'}): ReactElement`；`Dialog({open,title,onClose,children})` 和 `Drawer` 共享 `{open:boolean,title:string,onClose:()=>void,children:ReactNode}`；`WorkspaceShell({navigation,children}:{navigation:ReactNode,children:ReactNode}):ReactElement`。

- [ ] 编写组件交互测试：打开弹窗后焦点在其中，Escape 关闭并返回触发按钮；长标题可换行，按钮 boundingBox 的宽高均不小于 44；减少动态效果模式下无入场动画。
- [ ] 执行 `npm exec --workspace frontend -- playwright test e2e/workspace-ui.spec.ts`，确认新增行为尚未满足。
- [ ] 实现 tokens 与 Button，移除调用页面对共享控件颜色的重复硬编码。
- [ ] 实现 Dialog / Drawer 的焦点约束、背景关闭、Escape 和焦点恢复；Icon 使用本地 SVG。
- [ ] 实现 WorkspaceShell 并在首页接入，不改变项目 CRUD。
- [ ] 执行构建及上述测试，预期通过；截图检查 1440、1024、768、390 CSS 像素窗口。
- [ ] 提交 `feat: unify workspace UI primitives`，推送 origin。

## Task 2: 项目导航、搜索与导入

**Files:** 修改 `frontend/src/pages/{LibraryPage,ProjectWorkspace,ProjectView}.tsx`、`frontend/src/components/ProjectNotes.tsx`；测试 `frontend/e2e/{projects,navigation,document-import}.spec.ts`。

**Interfaces:** 使用任务 1 组件；保持 `/projects/:projectId?tab=sources|notes|chats|search|highlights`、现有 API 与文献路由。列表上下文使用 sessionStorage key `bbgddg:project-view:${projectId}`，结构 `{tab,query,collectionId,scrollTop}`，恢复时验证项目及文件夹仍存在。

- [ ] 添加回归断言：从文献返回后搜索词和文件夹保留；旧 tab 链接可打开；40 字标题不遮挡导入按钮；空列表有导入入口，导入失败可重试。
- [ ] 执行三个相关 spec，确认新增上下文行为未满足。
- [ ] 在 ProjectWorkspace 接入统一导航，显示文献、笔记、标注、对话入口，保留项目内搜索和 AI。
- [ ] 在 SourcesTab 保存和恢复列表上下文，复用已有文件夹、拖入及导入进度逻辑。
- [ ] 在首页及项目页应用统一加载、空白、错误状态，避免空列表与失败提示同时误导。
- [ ] 构建并执行相关 spec，预期通过。
- [ ] 提交 `feat: streamline project navigation and return context`，推送 origin。

## Task 3: 阅读布局与 iPad 面板

**Files:** 新建 `frontend/src/hooks/useReaderLayout.ts`、`frontend/src/components/ReaderTools.tsx`；修改 `frontend/src/pages/ReaderPage.tsx`、`frontend/src/workspace.css`；测试 `frontend/e2e/{reader-toolbar,study-workflow}.spec.ts`。

**Interfaces:** `type ReaderTool='chat'|'notes'|'annotations'|'related'`；`useReaderLayout():{activeTool:ReaderTool;panelOpen:boolean;panelWidth:number;setTool:(tool:ReaderTool)=>void;setPanelOpen:(open:boolean)=>void;setPanelWidth:(width:number)=>void}`。宽度小于 900 使用抽屉，否则并排；分屏依据窗口而非设备 UA；宽度限于 320 至 min(720,窗口宽度的 55%)，抽屉不受该下限约束。

- [ ] 添加测试：1024→768→390→1024 切换后页码、笔记草稿和已生成 AI 回答保留；抽屉关闭返回焦点；旧顶部折叠偏好仍生效。
- [ ] 执行相关 spec，确认新增布局断言失败。
- [ ] 实现 useReaderLayout 与 ReaderTools，显式区分文档操作与工具切换；保留滑块并增加拖动分隔线。
- [ ] 接入 ReaderPage；响应窗口变化时仅变布局，不卸载 Viewer、ChatPanel 或 NoteWorkbench；窄屏底部提供 AI / 笔记 / 标注按钮。
- [ ] 用 visualViewport 可用高度约束编辑抽屉，软键盘出现时编辑位置和保存入口可滚动到达。
- [ ] 构建并执行相关 spec；软键盘与旋转列入 iPad 真机清单，不将模拟结果等同于真机通过。
- [ ] 提交 `feat: adapt reader panels to tablet workflows`，推送 origin。

## Task 4: 笔记列表与编辑器分离

**Files:** 新建 `frontend/src/components/notes/{NoteList,NoteEditorBody}.tsx`；修改 `frontend/src/components/{NoteWorkbench,ProjectNotes}.tsx`；测试 `frontend/e2e/{notes,study-workflow}.spec.ts`。

**Interfaces:** 保留 `NoteWorkbench` 现有 props、NoteDraft 和 sessionStorage key；`NoteList({notes,activeId,onOpen})` 仅负责列表；`NoteEditorBody({draft,onChange,preview})` 使用现有 NoteDraft，不改 Markdown 存储格式。为下一计划预留 `children?:ReactNode` 扩展区。

- [ ] 添加测试：项目笔记和文献笔记分组正确，长列表可滚动，切换前未保存确认有效，保存失败保留正文，旋转不重复创建笔记。
- [ ] 执行相关 spec，确认新列表行为未满足。
- [ ] 抽出 NoteList，保持标签搜索和原文位置排序。
- [ ] 抽出 NoteEditorBody，将标题、正文、引用和 AI 来源分层；固定可见的保存状态，保留原文跳转。
- [ ] 构建并运行相关 spec，预期旧笔记内容与公式显示一致。
- [ ] 提交 `feat: separate note browsing and editing`，推送 origin。

## Task 5: AI 与设置一致性

**Files:** 修改 `frontend/src/components/{AiControlPanel,AiSettingsDialog,ChatPanel}.tsx`、`frontend/src/pages/{SettingsPage,ProjectChat}.tsx`；测试 `frontend/e2e/research-assistant.spec.ts`。

**Interfaces:** 保留 AI 选择、记忆、用量及引用 API；每条回答继续保留生成时的提问范围，切换模型不修改历史回答元数据。设置使用四个分组：阅读与标注、AI、数据与备份、应用信息。

- [ ] 添加测试：未配置工具有配置入口；生成中切换布局请求数仍为 1；摘入笔记保留引用；历史回答范围不随当前范围变化。
- [ ] 执行相关 spec，确认新增界面断言失败。
- [ ] 用共享组件统一 AI 控件、设置弹窗与分组，保留已有能力和错误详情。
- [ ] 添加编辑区域快捷键保护：输入框中不拦截普通文本组合键；关闭面板与保存使用明确按钮替代。
- [ ] 执行 `npm run build` 及所有已有前端 E2E；模拟 API 不消耗真实 AI 用量。
- [ ] 提交 `feat: unify AI controls and settings`，推送 origin。

## 交付与后续

截图保存到仓库外 outputs；记录验证命令与结果。手写进入计划 02，标注导出与备份进入计划 03。正式新版发布时按 AGENTS.md 完成打包验证、Release 与固定入口更新；本计划代码完成不自动等于已发布。
