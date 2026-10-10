# BBGDDG 标注复习、导出与备份 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让手写、文字标注和笔记可检索复习、往返原文，并可靠导出与恢复。

**Architecture:** 组合既有 annotations 和独立 ink 文档为只读索引，保留各自来源。PDF 导出合并可见标注；备份保留原始笔迹与附件，导入先验证后事务写入。

**Tech Stack:** 现有 TypeScript、SQLite、fflate；PDF 导出拟用 pdf-lib，实施时核验版本、许可和实际旋转页兼容后锁定版本。若无法满足定位与字体要求，不以截图式低质量导出替代。

**Spec:** `docs/superpowers/specs/2026-10-11-bbgddg-ui-ipad-design.md`；前置计划 01 和 02。

## Global Constraints

- PDF 原始文件不直接修改。
- 默认另存副本。
- 数据库升级前备份，采用增量迁移，不清空个人数据。
- 导出内容无缺页、错位和裁切，原 PDF 不变，备份可恢复可编辑笔迹。
- 首轮 PDF 导出允许将标注合并为可见页面内容；在外部阅读器中继续编辑标准 PDF 注释属于后续独立能力。
- 独立 iPad App、PencilKit 原生集成、完整离线使用、跨设备同步均是后续平台工作。

## Review Focus

- 原文件内容变更后错绑标注：任务 1、2。
- 旋转页、高光透明度、中文或公式丢失：任务 2。
- 恶意 ZIP 路径、解压炸弹和错误引用：任务 3。
- 重复导入和部分失败损坏旧数据：任务 3。
- 引用跳转导致丢失复习位置：任务 1。

## Task 1: 标注索引与来源往返

**Files:** 新建 `frontend/src/ink/annotation-index.ts`；修改 `frontend/src/components/AnnotationPanel.tsx`、ReaderPage、ProjectWorkspace；测试 `frontend/e2e/annotation-review.spec.ts`。

**Interfaces:** `buildAnnotationIndex(annotations:Annotation[],ink:InkDocument[]):ReviewItem[]`；`ReviewItem={id:string,kind:'highlight'|'underline'|'ink'|'image',sourceId:string,page:number,color:string,targetId:string}`。客户端过滤页码 / 颜色 / 类型；原文往返状态保存 `{route,page,panel,scrollTop}` 于路由 state，恢复前验证目标仍存在。

- [ ] 编写测试：过滤结果只含目标类型及页码；隐藏笔迹不删除；内容 hash 不同提示不适配；引用往返恢复原面板和页码。
- [ ] 执行 `npm exec --workspace frontend -- playwright test e2e/annotation-review.spec.ts`，确认新索引缺失。
- [ ] 实现索引与筛选；手写删除使用可撤销命令，旧 annotation 删除提供软恢复动作，通过已有创建 API 重建并更新 ID 映射。
- [ ] 实现原文与笔记来源往返，失效来源提供明确反馈，不跳到错误页面。
- [ ] 执行相关 E2E；提交 `feat: review annotations and return to source context`，推送 origin。

## Task 2: PDF 与混合笔记导出

**Files:** 新建 `src/core/ink-export.ts`、`src/server/export-routes.ts`、`frontend/src/components/ExportDialog.tsx`；修改 app.ts、ReaderPage、NoteWorkbench、package.json 和锁文件；测试 `test/integration/ink-export.test.ts` 与 `frontend/e2e/note-print.spec.ts`。

**Interfaces:** `exportAnnotatedPdf(projectId:string,sourceId:string):Promise<Uint8Array>`；前端新增 `frontend/src/ink/print-note.tsx`，`printNote(note:Note,ink:InkDocument,attachments:ResolvedAttachment[]):Promise<void>`，`ResolvedAttachment={id:string,url:string,width:number,height:number}`。POST `/api/projects/:projectId/exports` body `{kind:'source',id:string}` 返回带 Content-Disposition 的 PDF，复用本机会话鉴权。笔记使用同源打印页面和浏览器“存储为 PDF”，界面明确说明该步骤，不承诺静默生成。

- [ ] 编写测试：原始 PDF hash 不变；导出页数相同；旋转页与裁切页标记落在预期区域；高光透明度存在；笔记包含中文、公式、手写与引用截图；跨项目导出拒绝。
- [ ] 执行 `node --import tsx --test test/integration/ink-export.test.ts`，确认能力缺失。
- [ ] 在临时 fixture 核验 pdf-lib 旋转、裁切和透明度，通过后安装锁定版本，保留许可；中文字体复用现有合法字体资源并核实嵌入许可。
- [ ] 实现 PDF 页面原坐标上的路径 / 高光叠加；实现同源笔记打印视图，复用 ReactMarkdown / KaTeX 并嵌入 SVG 笔迹，等待字体和图片加载后调用 window.print()；@page 页边距 18mm，超页高笔迹块按比例缩到可用页高，正文按自然分页，不裁切。关闭打印页撤销 object URLs。
- [ ] 接入导出弹窗：选范围、显示保存前仍有待同步手写时禁止生成旧版本，失败提供重试；不覆写原文。
- [ ] 运行测试并将 fixture 导出逐页渲染做视觉检查；记录页数、坐标与中文公式结果。
- [ ] 提交 `feat: export annotated documents and mixed notes`，推送 origin。

## Task 3: 可编辑备份与恢复

**Files:** 新建 `src/core/ink-backup.ts`；修改 export-routes.ts、SettingsPage；测试 `test/integration/ink-backup.test.ts`；更新 `docs/validation/IPAD-INK.md`。

**Interfaces:** `createInkBackup(projectId:string):Promise<Uint8Array>`；`restoreInkBackup(projectId:string,archive:Uint8Array):Promise<{created:number,duplicates:number}>`。ZIP 含 manifest version 1、目标原始 ID 与 contentHash、笔记元数据、ink JSON、附件及 SHA-256；不含口令、密钥或数据库。恢复到已有项目需由用户确认，按 contentHash 映射现有文献；缺失文献时报告，保持原文献锚点信息，不强绑其他文件。

- [ ] 编写测试：往返恢复笔迹仍可编辑；重复恢复不复制相同内容；含 ../、绝对路径、坏 checksum、未知版本、超限 ZIP 全部拒绝；失败不改变现有记录。
- [ ] 执行 `node --import tsx --test test/integration/ink-backup.test.ts`，确认尚无该能力。
- [ ] 实现 manifest 校验：压缩包上限 100 MiB，解压合计上限 200 MiB，单附件 5 MiB，条目上限 10000，禁止符号链接与路径逃逸；验证后先写受控暂存区，再事务写入引用，失败回滚并清理暂存文件。
- [ ] 实现相同 target / hash / 内容摘要去重；不同内容生成新的恢复副本，不覆盖服务器版本。文献原文件不在此备份中，界面注明这是笔记与标注备份。
- [ ] 设置页添加备份 / 恢复入口与结果；真机验证导出文件保存到“文件”并可再次导入。
- [ ] 执行全部相关测试及构建；提交 `feat: back up and restore editable annotations`，推送 origin。

## 发布条件

- [ ] 计划 01–03 的必要任务通过，未完成项逐条列明。
- [ ] 真实 iPad + Pencil 验证通过，安全访问与认证已确定；否则不发布 iPad 正式可用声明。
- [ ] Windows 打包、干净数据启动、旧数据升级与固定入口启动验证通过；遵守 AGENTS.md 更新 Release 下载文件及校验值，保留用户数据。
- [ ] OCR、手写识别、局部擦除、形状辅助、原生 iPad / 同步继续留在后续路线，不伪装成已交付。
