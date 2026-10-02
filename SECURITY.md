# PDFPal 2.1.1 安全边界

## 本轮修复

- 本地 HTTP 服务每次启动生成 256 位随机会话口令。桌面通过内部通道获取口令并设置 HttpOnly、SameSite=Strict 会话 cookie。所有文献、笔记、AI 接口及静态文件均要求会话授权。
- 服务只接受本机 Host 和当前端口，拒绝跨站 Origin、跨站请求及仅凭 cookie 发起而没有来源的修改请求。来源和 CORS 不能替代口令。
- 页面限制脚本、网络和嵌入来源；启动链接使用 URL 片段传递口令，立即清除片段，口令不进入 HTTP 请求日志。日志对 cookie 与口令头做脱敏。
- API 主密钥由 Windows 系统保护，桌面仅通过私有 IPC 将其交给服务进程，并只保存在该进程内存中。Windows 密钥保护不可用时停止启动，不降级到明文主密钥文件。
- AI 命令行子进程移除 PDFPal 内部环境变量，包括主密钥、会话口令和数据目录。工具自身的认证环境仍由工具管理，PDFPal 不复制其账号凭据。

## 验证

隔离测试覆盖未授权读写拒绝、伪造 Host 拒绝、跨站修改拒绝、cookie 属性、会话轮换、前端登录、PDF 阅读、API 问答、高亮注释、主密钥与会话环境隔离、加密配置以及原生软件重启持久化。使用合成密钥和本机模拟 API，没有读取真实密钥或发起真实服务商调用。

## 仍然存在的边界

- 这些修复不构成绝对安全保证，也不是完整渗透测试或独立安全认证。
- 同一 Windows 账户下的恶意程序、管理员或系统被入侵时，仍可能读取应用内存、用户文件或解密系统凭据；Windows DPAPI 不隔离同一账户的所有应用。
- PDF、笔记及数据库没有进行全盘加密。需要保护设备账户和磁盘。
- 云端 AI 问答会向所选服务发送文献提取文字。不要向未经确认的 API 地址提交敏感文献或密钥。
- DeepSeek Harness 与自定义 WorkBuddy 适配器的工具权限依赖其自身配置；命令行进程并非都拥有相同的操作系统沙箱。
- 安装包尚未获得受信任的发布者数字签名。请仅使用本任务提供的软件，并核对 SHA-256 校验文件。

实现位置：`src/server/local-access.ts`、`desktop/main.cjs`、`desktop/backend.mjs`、`src/core/ai-secrets.ts`。

官方依据：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[Windows safeStorage 的保护范围](https://www.electronjs.org/docs/latest/api/safe-storage)。
