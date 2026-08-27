# dsh-problem-discovery

面向 DeepSeek Harness 的本地问题发现插件。它注册一个 `problem_discovery` 工具和可选的 `/problem-discovery <request>` 命令，在 Goal、PRD、设计或实现之前运行固定的三阶段工作流：

1. **Collect**：广扫已授权来源、去重信号并初排最多十二个候选项。
2. **Discover**：把候选证据整理为带 `Observed:` / `Inference:` 标签的 Problem Brief。
3. **Challenge**：移除无依据假设，留下一个最可能改变后续决策的问题。

## 安装

将插件安装为 `web` profile 的普通依赖：

```sh
dsh plugin --profile web add github:Wlx682/dsh-problem-discovery
```

安装时出现“declares no `dsh.bundle`”提示是正常的。插件不应成为 Host profile 配置层，而是由自定义 Agent preset 挂载。

把仓库的 `preset` 目录复制到用户 preset 根：

```sh
mkdir -p ~/.dsh/.agent-presets/problem-discovery
cp preset/agent.cordis.yml preset/preset.yml ~/.dsh/.agent-presets/problem-discovery/
```

然后重启 DSH Web，新建会话并选择“问题发现模式”。

## Preset 设计

Problem Discovery 使用独立 preset，而不是修改 DSH 的 `code` 或 `native` preset。preset 只保留只读仓库搜索、Web 搜索、提问、压缩和固定工作流，有意不提供 shell、文件修改、Goal、规划、通用 subagent 和实现工具。

preset 的工具呈现模式为 `both`。三个工作流子 Agent 都继承这一模式；阶段提示词让 Collect 优先使用 PTC 完成广扫、去重和初排，而 Discover 与 Challenge 重新进行语义判断。

## 开发验证

插件入口是无第三方运行时依赖的 [`index.js`](index.js)，因此从 GitHub 安装时不需要执行构建脚本。运行内置测试：

```sh
npm test
```

测试覆盖插件注册、命令消息、固定工作流启动、结果校验和父 Agent 输出渲染。

## 限制

- 只在直接用户明确要求问题发现时调用。
- 工作流固定启动三个 Agent，调用方不能改写阶段脚本或 Schema。
- 输出是等待人类确认的临时 Problem Brief，不会自动创建 Goal 或开始实现。
- 所有工作流子 Agent 当前继承同一个 preset；阶段级工具呈现选择需要 DSH 将来提供选择性路由能力。
