# 参与 BBGDDG

使用 Node.js 24，先阅读 README、NOTICE 和 SECURITY。不要提交个人 PDF、密钥、数据库、日志、依赖目录或安装产物。

1. 根目录执行 npm ci。
2. 改动后运行 npm run typecheck、npm test 和 npm run build。
3. 界面改动运行 cd frontend && npx playwright test，首次安装 Chromium。
4. 鉴权、API、进程相关改动运行 npm run test:security；桌面另行原生验证，见 desktop/README.md。
5. 每轮验证后提交本地 Git，说明修改与结果。只有用户明确要求才推送远端。

保持中文深色界面。浏览器与 CLI 复用核心服务，安全判断在服务端。测试使用临时数据和模拟服务，不读取真实凭据或文献、不产生付费请求。

问题报告包含版本、系统、复现步骤和预期行为。日志先去掉会话链接、账号、API 密钥及敏感文件名。保留作者历史、来源通知与第三方许可。

安全问题不要公开粘贴密钥或利用细节。当前未公布安全联系渠道；建立公开仓库时先启用 GitHub 私密漏洞报告再公布渠道。
