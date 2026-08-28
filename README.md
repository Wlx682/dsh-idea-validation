# dsh-idea-validation

面向 DeepSeek Harness 的有状态想法验证插件。它不再一次性生成一份看起来完整的 Problem Brief，而是让同一个想法跨多轮逐步通过人工门禁：

```text
澄清 → 问题确认 → 取证计划 → 证据结论 → 方案比较 → 最小实验 → 实施交接
```

每次 `idea_validation` 调用只推进一个阶段，返回 `caseId`、`revision`、完整状态快照和当前唯一门禁。用户未确认时不会自动进入下一阶段；格式错误只修复当前阶段，不会重跑已经完成的工作。

## 它解决什么问题

- 用户补充的上下文成为正式状态，不再只把最初一句话反复交给新 Agent。
- 问题、假设、证据、方案和实验分开，防止用方案证明问题。
- 先选择一个最高风险假设，再做定向取证；默认不广扫工作区。
- 工作区材料只有命中显式 `authorizedSources` 才能成为工作区证据。
- 实验必须包含干预、比较方式、唯一主指标、护栏和通过/失败阈值。
- 最终输出最多五步关键路径和实施交接；实际写代码仍需用户在可写开发模式中明确启动。

## 阶段与门禁

| 阶段 | 产物 | 人类动作 |
| --- | --- | --- |
| `clarify` | 1–3 个能改变决策的澄清问题 | `continue / revise / defer / reject` |
| `frame` | 问题、期望结果、假设、最高风险假设 | `approve / revise / pivot / defer / reject` |
| `evidence-plan` | 单一决策问题、限定来源、通过/失败信号 | 同上 |
| `evidence-result` | 带来源范围和验证状态的证据结论 | 同上 |
| `options` | 2–3 个可比较干预方案 | 选择方案后 `approve` |
| `experiment` | 可归因的最小实验和唯一主指标 | `approve / revise / pivot / defer / reject` |
| `implementation` | 关键路径、Scope、AC、埋点、回滚、下一动作 | `approve / revise / defer / reject` |
| `complete` | 实施就绪交接 | 在可写模式中显式开始执行 |

`approve` 只代表用户批准当前门禁，不代表实施已经发生。

## 使用

自然语言可以直接说“帮我验证这个想法”“完善想法并找关键路径”，也可以使用命令：

```text
/idea-workflow 我觉得需求从提出时就缺少价值判断，想改进研发流程
```

兼容命令 `/problem-discovery`，它与 `/idea-workflow` 都进入新的 `idea_validation` 工具。

工具的首次调用：

```json
{
  "action": "start",
  "request": "原始想法",
  "context": "可选的直接用户上下文",
  "authorizedSources": []
}
```

用户回答门禁后继续同一 case：

```json
{
  "action": "continue",
  "caseId": "上次返回的 caseId",
  "expectedRevision": 1,
  "decision": "continue",
  "humanResponse": "用户的真实回答"
}
```

运行时会保存最近的 case，因此正常续做只需 `caseId + expectedRevision`。状态快照同时随结果返回，可在进程重启后通过 `state` 参数恢复。相同参数的重复调用是幂等的；陈旧 revision 会被拒绝。

## 证据边界

证据明确区分：

- `user`：直接用户口述，仅为 `reported`，除非有数据核实。
- `workspace`：工作区材料，locator 必须位于显式 `authorizedSources`；只读 preset 不读取文件正文，所以仅凭路径不能标记为 `verified`，需要用户提供内容或在外部核实后作为上下文传入。
- `web`：外部背景，不能证明用户组织内部根因。
- `experiment`：本次实验产生的读数。

验证状态使用 `reported / verified / inferred / unverified`，另用 `supports / weakens / neutral` 表示证据方向，避免把所有材料压成含义模糊的 `Observed:`。

## 安装

```sh
dsh plugin --profile web add github:Wlx682/dsh-idea-validation
mkdir -p ~/.dsh/.agent-presets/idea-validation
cp preset/agent.cordis.yml preset/preset.yml ~/.dsh/.agent-presets/idea-validation/
```

重启 DSH Web 后选择“想法验证模式”。preset 默认只提供 Web 搜索和状态工作流，不提供 shell、文件修改、Goal 或通用委派；也不再暴露全仓库搜索，以避免无关文件污染问题证据。

preset 使用稳定子入口 `dsh-idea-validation/workflow`。从旧版原地升级且暂时不能重启长驻 DSH 进程时，也可把已安装 preset 的该行临时改为 `../../profiles/web/node_modules/dsh-idea-validation/runtime.js`，用新的模块文件完成热迁移；正式部署仍建议在方便时重启一次 Web 服务。

## 验证

先运行针对真实事故的专项回归，再运行完整测试：

```sh
npm run test:dedicated
npm test
```

专项回归固定验证：阶段级修复、单 Agent 阶段预算、重复启动幂等、无默认工作区广扫。完整测试另外覆盖跨轮状态、revision 乐观锁、证据授权、实验、实施交接和终态。

## 设计边界

- 插件负责把想法推进到“实施就绪”，不在只读 preset 内声称已经实现。
- 人类决定 proceed、pivot、defer 或 reject；Agent 只提供结构化判断材料。
- 运行时状态是便利缓存，返回的状态快照才是可迁移恢复材料。
- 所有阶段共享同一 preset；通过删除默认文件搜索、使用 `native` 工具呈现和宿主语义校验收紧边界。
