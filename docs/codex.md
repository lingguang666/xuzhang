# 连接 Codex

先启动续章。数据目录中会生成 `codex-mcp.toml`，内容已使用当前电脑的绝对路径；双击 Open-Data.cmd 找到它。

将文件中的 `[mcp_servers.xuzhang]` 和对应的 env 配置合并到 Codex 用户配置 `~/.codex/config.toml`。如果已经有同名配置，先备份，再更新那一段，不要重复添加或覆盖其他配置。本软件不会自动改动 Codex 配置。重新加载连接或重启 Codex。

配置采用官方文档支持的 stdio `command`、`args` 和 `env` 字段：[OpenAI MCP 文档](https://developers.openai.com/codex/mcp)。command 指向运行包自带 Node，args 指向 mcp-server.js，XUZHANG_DATA_ROOT 与网页共用数据目录。移动软件后，重新启动并更新这份配置。

首次对话可说：

> 列出续章项目，选择“我的项目”，读取当前思路、最近讨论成果和待处理事项。不要替我确认批注或验收。

讨论结束可说：

> 把本次讨论的选择、理由、未决问题、下一步和相关修改一起保存到续章。

每条连接单独选择项目，网页切换不会替 AI 切换。AI 使用当前版本提交，冲突时应重新读取，不能强行覆盖。作者在网页验收。

22 个工具覆盖项目选择、思路与蓝图、决定、素材检索、证据、主张关联、批注、文字修改、整组提交与读取差异。桌面网页和 MCP 使用同一 SQLite 库，MCP 可以在网页关闭时继续工作。

Skills 由使用者自行安装调用；发行包没有捆绑个人 skill 文件、凭据或模型。


## 直接在 Codex 新建论文（beta.2）

可以说：“在续章新建一个研究论文项目，叫‘我的第二篇论文’，保存我们刚讨论的目标、思路和草稿，选择这个新项目继续。”

AI 使用 create_project，填写 name、templateId、goal，以及可选 sections（name、claim、draft 等）、paperContext、writingRequirements、openQuestions。没有给出的内容留空。创建返回唯一项目编号，默认只绑定当前 MCP 连接；其他连接和网页保持原项目。随后 read_project 读取后再修改。

get_current_project 可核对本连接目标。每次修改显式携带 projectId 与 revision，目标不匹配会拒绝。新连接默认未选择项目，不继承另一连接的选择。

每次新建使用唯一 requestId，网络重试沿用原编号，返回同一个项目。相同编号不能用于其他创建内容；同名项目默认提示已有编号，只有用户明确要求同名独立项目时才设置 allowSameName=true。selectCreated=false 表示只创建、不切换。重放旧创建请求不会把已选其他项目的连接切回去。

网页通过“切换项目”查看新项目，不随 AI 的选择自动跳转。创建记录与原始素材目录保存在同一数据根目录下，各项目独立；作品记录不会从旧项目复制。MCP 的选择边界是连接，客户端若复用同一连接则共享该选择，因此操作前应核对 get_current_project 和返回的项目编号。
