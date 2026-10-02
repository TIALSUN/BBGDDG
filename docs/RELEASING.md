# 发布 BBGDDG

当前仅整理本地，没有 BBGDDG GitHub 远端、npm 包或已签名的官方安装包。对外发布需用户明确授权。

1. 核实 NOTICE 的上游 MIT 声明与署名，不隐去上游缺少独立许可正文的事实。
2. 干净克隆后用 Node 24 和锁文件执行 npm ci，确保无需本机路径或已有依赖目录。
3. 执行 CONTRIBUTING 的检查；Windows 构建按 README 步骤，并测试阅读注释与模拟 API。
4. 保持根目录、CLI、桌面版本一致；更新 CHANGELOG，保留所有许可通知。
5. 用 git archive 制作源码包，只包含提交文件；git bundle 保存历史。不要压缩整个工作目录。
6. 检查公开文件与历史中的真实凭据、个人路径和用户文件。如泄露凭据先撤销。
7. 核对 SHA-256，说明安装包未签名。校验值不能替代受信任的发布者签名。
8. 用户确认后才创建自己的 GitHub 仓库并配置 origin；upstream 仅用于参考原项目，不向原作者仓库推送。

发布 npm 需确认包名归属并取消根 package.json 的 private。README 不使用尚未发布的全局安装命令。
