# PDFPal 中文桌面版

Windows x64 应用，自带 Node 和本地服务。默认将个人数据存放在 `%APPDATA%\PDFPal\data`，安装目录与数据目录分开，卸载不会自动删除文献和笔记。

## 构建

在 Windows x64 上，用同一个 Node 24 环境安装父项目依赖并构建前端与后端，再执行：

```powershell
cd desktop
npm ci
npm run prepare:runtime
npm run package
```

`prepare:runtime` 复制构建结果、安装生产依赖、保留对应 Node ABI 的 SQLite 模块，并生成图标。构建结果默认写入本次部署工作区的 `outputs` 文件夹，可通过 electron-builder 的 `--config.directories.output` 改写。安装包不包含个人文献、数据库和账号。

## 运行

安装版创建桌面和开始菜单快捷方式；便携版无需安装。两种版本在同一个 Windows 用户下共享数据。双击启动独立窗口，关闭窗口后自动停止本地服务，重复启动会聚焦已有窗口。

按 Alt 可显示中文菜单，通过“文件 → 打开数据文件夹”备份文献和笔记。AI 功能依赖本机已安装并登录的 Codex、Claude 或 OpenCode；阅读、笔记与高亮不需要 AI 登录。桌面版会自动寻找 Codex 应用自带的命令行程序，也支持原有环境变量与数据目录中的 config.json。

## 开发与验证

`npm start` 使用准备好的本地运行环境。自动测试应设置 `PDFPAL_DESKTOP_USER_DATA_DIR` 指向独立临时目录，避免接触个人数据。后端只监听 127.0.0.1，并使用系统分配的空闲端口。渲染窗口开启进程隔离和沙箱，不开放 Node API。

`npm run test:smoke -- "完整的 PDFPal.exe 路径"` 验证打包的应用，使用父项目已有的 Playwright。测试会检查运行环境、隔离设置、PDF 导入、注释保存、高亮位置和取消高亮，临时数据库位于部署工作区。
