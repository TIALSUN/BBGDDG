# 1.2.2 安装目录验证（2026-10-08）

- NSIS 使用辅助安装向导：`oneClick=false`，`allowToChangeInstallationDirectory=true`。
- `deleteAppDataOnUninstall=false`，应用身份和 AppData 数据路径保持不变。
- 从已提交源代码独立打包，运行环境沿用 1.2.1；未包含尚未完成的多语言改动。
- 安装包使用 `/S /D=...` 实际安装到工作区自定义目录；安装退出码为 0，目标目录存在完整程序。
- 解包程序、实际安装后的程序、桌面固定入口均通过启动、SQLite、本地服务、PDF 导入、高亮位置、注释持久化、取消高亮及渲染隔离测试。
- 测试使用独立合成数据，未操作用户文献。更新固定入口前后，用户数据目录文件清单、大小和修改时间相同。
- 安装向导目录页使用 electron-builder 26.0.12 内置 NSIS 模板；本次自定义路径安装验证使用静默参数，未自动点击原生安装向导页面。
- GitHub CI：0096818，所有检查通过：https://github.com/TIALSUN/BBGDDG/actions/runs/37728925661。