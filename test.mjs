import assert from 'node:assert/strict'
import { apply, inject, name } from './index.js'

function payloadFor(stage) {
  const payload = {
    ideaType: 'process',
    clarifications: [],
    openQuestions: ['你要改变的具体决策是什么？'],
    problem: {
      actor: '', situation: '', observedPain: '', impact: '', desiredOutcome: '', constraints: [], decisionToMake: '',
    },
    assumptions: [],
    riskiestAssumption: '',
    evidencePlan: { question: '', method: '', sources: [], passSignal: '', failSignal: '' },
    evidence: [],
    validationSummary: { outcome: 'not-run', rationale: '', remainingUncertainty: '' },
    options: [],
    selectedOption: '',
    experiment: {
      smallestSlice: '', intervention: '', comparison: '', primaryMetric: '', guardrails: [], baseline: '',
      passThreshold: '', failThreshold: '', duration: '', owner: '', authorityBoundary: '', dependencies: [],
    },
    criticalPath: [],
    implementationHandoff: {
      objective: '', scopeIn: [], scopeOut: [], acceptanceCriteria: [], instrumentation: [], rollback: '', nextAction: '',
    },
  }
  if (stage === 'clarify') return payload

  payload.clarifications = [{ question: '你要改变的具体决策是什么？', answer: '减少无价值需求进入开发' }]
  payload.openQuestions = []
  payload.problem = {
    actor: '研发团队',
    situation: '需求进入开发前缺少价值判断',
    observedPain: '目标偏离和返工反复发生',
    impact: '开发时间浪费且线上缺陷增加',
    desiredOutcome: '更早淘汰无价值或不清晰的需求',
    constraints: ['先在一个需求上试点'],
    decisionToMake: '是否引入需求价值门禁',
  }
  payload.assumptions = [{
    statement: '前置价值门禁能减少定义后的需求变更', risk: '可能只增加流程耗时', testability: '比较试点前后的变更率',
  }]
  payload.riskiestAssumption = payload.assumptions[0].statement
  if (stage === 'frame') return payload

  payload.evidencePlan = {
    question: '价值门禁是否能减少定义后的需求变更？',
    method: '对一个试点需求记录门禁结果并与历史同类需求比较',
    sources: ['直接用户提供的历史需求记录'],
    passSignal: '试点需求的定义后变更次数低于可比基线',
    failSignal: '流程耗时增加但变更次数不降',
  }
  if (stage === 'evidence-plan') return payload

  payload.evidence = [{
    claim: '历史同类需求平均发生三次定义后变更', sourceType: 'user', locator: 'direct-human',
    verification: 'reported', direction: 'supports', relevance: '提供试点比较基线',
  }]
  payload.validationSummary = {
    outcome: 'inconclusive', rationale: '只有口述基线，尚无试点读数', remainingUncertainty: '门禁是否真正降低变更',
  }
  if (stage === 'evidence-result') return payload

  payload.options = [
    {
      name: '轻量价值门禁', intervention: '定义前回答目标、用户价值、反例和成功信号', expectedValue: '尽早淘汰弱需求',
      effort: '低', risk: '可能形式化', reversibility: '可随时停止', authorityNeeded: '需求负责人同意',
    },
    {
      name: '完整流程重构', intervention: '重构需求到发布全流程', expectedValue: '覆盖更全面', effort: '高',
      risk: '难以归因', reversibility: '低', authorityNeeded: '跨团队授权',
    },
  ]
  if (stage === 'options') return payload

  payload.selectedOption = '轻量价值门禁'
  payload.experiment = {
    smallestSlice: '一个真实需求进入定义前的单次门禁',
    intervention: '增加目标、用户价值、反例和成功信号检查',
    comparison: '与最近三个同类需求的定义后变更次数比较',
    primaryMetric: '定义后的需求变更次数',
    guardrails: ['门禁耗时'],
    baseline: '最近三个同类需求的平均变更次数',
    passThreshold: '变更次数低于基线且门禁耗时不超过半天',
    failThreshold: '变更次数不降或门禁耗时超过半天',
    duration: '一个需求周期',
    owner: '需求负责人',
    authorityBoundary: '只覆盖该需求，不修改团队制度',
    dependencies: ['需求负责人参与'],
  }
  if (stage === 'experiment') return payload

  payload.criticalPath = [
    { order: 1, outcome: '记录可比基线', owner: '需求负责人', dependency: '历史需求记录', acceptance: '基线口径可复算' },
    { order: 2, outcome: '执行一次价值门禁', owner: '需求负责人', dependency: '待评审需求', acceptance: '四项问题均有明确答案' },
    { order: 3, outcome: '完成同口径比较', owner: '需求负责人', dependency: '需求周期结束', acceptance: '得到 proceed/pivot/stop 结论' },
  ]
  payload.implementationHandoff = {
    objective: '验证轻量价值门禁能否减少定义后的需求变更',
    scopeIn: ['一个真实需求', '一次门禁', '同口径测量'],
    scopeOut: ['全团队流程改造', '自动编码实现'],
    acceptanceCriteria: ['门禁记录完整', '主指标有基线和试点读数', '结论可复核'],
    instrumentation: ['门禁耗时', '定义后需求变更次数'],
    rollback: '停止门禁并保留实验记录',
    nextAction: '在具备写权限的开发模式中创建执行 Goal',
  }
  return payload
}

function stateFor(stage, payload = payloadFor(stage), authorizedSources = []) {
  return {
    version: 2,
    caseId: `case-${stage}`,
    revision: 1,
    originalRequest: '优化需求到开发的工作流',
    stage,
    status: stage === 'implementation' ? 'ready-for-execution' : 'awaiting-human',
    authorizedSources,
    payload,
    gate: { prompt: 'untrusted caller gate', allowedDecisions: ['reject'] },
    decisionLog: [],
  }
}

let parentCounter = 0
function setup() {
  let registeredTool
  const commands = new Map()
  let promptSection
  const starts = []
  const queue = []
  let disposed = 0
  const context = {
    systemPrompt: { section(section) { promptSection = section } },
    tools: { register(tool) { registeredTool = tool } },
    inject(_services, callback) {
      callback({ commands: { register(command) { commands.set(command.name, command) } } })
    },
    workflowEngine: {
      start(spec) {
        starts.push(spec)
        const result = queue.shift()
        if (result === undefined) throw new Error('test queue exhausted')
        return {
          id: `run-${starts.length}`,
          result: Promise.resolve(result),
          cancel() {},
          async dispose() { disposed += 1 },
        }
      },
    },
  }
  apply(context)
  const parent = { id: `parent-${++parentCounter}` }
  const signal = new AbortController().signal
  const enqueue = (payload, overrides = {}) => queue.push({
    stopReason: 'completed', agentsStarted: 1, value: { payload }, ...overrides,
  })
  return {
    context, commands, promptSection, starts, enqueue, parent, signal,
    get tool() { return registeredTool },
    get disposed() { return disposed },
  }
}

{
  const test = setup()
  const delegated = { ...test.parent, session: { header: { delegationDepth: 1 } } }
  await assert.rejects(
    test.tool.execute({ action: 'start', request: '不得递归' }, { agent: delegated, signal: test.signal }),
    /cannot be called from a workflow child or delegated subagent/,
  )
  assert.equal(test.starts.length, 0, 'delegated callers must be rejected before starting a workflow')
}

assert.equal(name, 'idea-validation')
assert.deepEqual(inject, ['tools', 'workflowEngine', 'systemPrompt'])

{
  const test = setup()
  assert.match(test.promptSection.text, /same caseId/)
  assert.equal(test.tool.name, 'idea_validation')
  assert.deepEqual([...test.commands.keys()].sort(), ['idea-workflow', 'problem-discovery'])
  const steered = []
  const commandResult = test.commands.get('idea-workflow').handler({
    agent: { steer(message) { steered.push(message) } }, rawInput: '  验证一个研发流程想法  ',
  })
  assert.deepEqual(commandResult, { kind: 'success', text: 'Idea workflow started.' })
  assert.match(steered[0].content[0].text, /Do not research or draft a parallel brief/)
  assert.match(steered[0].content[0].text, /验证一个研发流程想法/)
}

{
  const test = setup()
  test.enqueue(payloadFor('clarify'))
  const args = { action: 'start', request: '  优化需求到开发的工作流  ' }
  const started = await test.tool.execute(args, { agent: test.parent, signal: test.signal })
  assert.equal(started.result.stage, 'clarify')
  assert.equal(started.result.revision, 1)
  assert.equal(started.result.originalRequest, '优化需求到开发的工作流')
  assert.deepEqual(started.result.gate.allowedDecisions, ['continue', 'revise', 'defer', 'reject'])
  assert.equal(test.starts[0].maxTotalAgents, 1)
  assert.equal(test.starts[0].args.phaseTitle, 'clarify')
  assert.doesNotMatch(test.starts[0].args.prompt, /Scan broadly/)

  const duplicateStart = await test.tool.execute(args, { agent: test.parent, signal: test.signal })
  assert.equal(duplicateStart.result.caseId, started.result.caseId)
  assert.equal(test.starts.length, 1, 'identical starts must be idempotent')

  test.enqueue(payloadFor('frame'))
  const continueArgs = {
    action: 'continue', caseId: started.result.caseId, expectedRevision: 1, decision: 'continue',
    humanResponse: '研发团队要减少无价值需求进入开发',
  }
  const framed = await test.tool.execute(continueArgs, { agent: test.parent, signal: test.signal })
  assert.equal(framed.result.stage, 'frame')
  assert.equal(framed.result.revision, 2)
  assert.equal(framed.result.decisionLog[0].response, continueArgs.humanResponse)
  assert.match(test.starts[1].args.prompt, /研发团队要减少无价值需求进入开发/)

  const duplicateContinue = await test.tool.execute(continueArgs, { agent: test.parent, signal: test.signal })
  assert.equal(duplicateContinue.result.revision, 2)
  assert.equal(test.starts.length, 2, 'identical continues must be idempotent')

  await assert.rejects(
    test.tool.execute({ ...continueArgs, decision: 'revise', humanResponse: '不同反馈' }, { agent: test.parent, signal: test.signal }),
    /stale case revision/,
  )

  const rendered = test.tool.output.render(args, started)[0].text
  assert.match(rendered, /STATE_SNAPSHOT/)
  assert.match(rendered, new RegExp(started.result.caseId))
}

{
  const test = setup()
  const invalid = payloadFor('clarify')
  invalid.openQuestions = []
  test.enqueue(invalid)
  test.enqueue(payloadFor('clarify'))
  const repaired = await test.tool.execute(
    { action: 'start', request: '触发阶段修复' },
    { agent: test.parent, signal: test.signal },
  )
  assert.equal(repaired.agentsStarted, 2)
  assert.equal(repaired.runIds.length, 2)
  assert.equal(test.starts.length, 2)
  assert.equal(test.starts[0].args.phaseTitle, 'clarify')
  assert.equal(test.starts[1].args.phaseTitle, 'clarify')
  assert.match(test.starts[1].args.prompt, /Repair only the clarify payload/)
  assert.match(test.starts[1].args.prompt, /openQuestions/)
  assert.equal(test.disposed, 2)
}

{
  const test = setup()
  const unauthorized = payloadFor('evidence-result')
  unauthorized.evidence = [{
    claim: '无关 PRD 证明用户有落地能力', sourceType: 'workspace', locator: '/tmp/PRD-好问题社区.md',
    verification: 'verified', direction: 'supports', relevance: '错误上下文关联',
  }]
  test.enqueue(unauthorized)
  test.enqueue(payloadFor('evidence-result'))
  const advanced = await test.tool.execute({
    action: 'continue', state: stateFor('evidence-plan'), expectedRevision: 1, decision: 'approve',
  }, { agent: test.parent, signal: test.signal })
  assert.equal(advanced.result.stage, 'evidence-result')
  assert.equal(test.starts.length, 2)
  assert.match(test.starts[1].args.prompt, /outside authorizedSources/)
  assert.equal(advanced.result.payload.evidence[0].sourceType, 'user')
}

{
  const test = setup()
  test.enqueue(payloadFor('experiment'))
  const experiment = await test.tool.execute({
    action: 'continue', state: stateFor('options'), expectedRevision: 1, decision: 'approve', humanResponse: '选择轻量价值门禁',
  }, { agent: test.parent, signal: test.signal })
  assert.equal(experiment.result.stage, 'experiment')
  assert.equal(experiment.result.payload.experiment.primaryMetric, '定义后的需求变更次数')

  test.enqueue(payloadFor('implementation'))
  const ready = await test.tool.execute({
    action: 'continue', caseId: experiment.result.caseId, expectedRevision: 2, decision: 'approve',
  }, { agent: test.parent, signal: test.signal })
  assert.equal(ready.result.stage, 'implementation')
  assert.equal(ready.result.status, 'ready-for-execution')
  assert.ok(ready.result.payload.criticalPath.length <= 5)

  const beforeComplete = test.starts.length
  const completed = await test.tool.execute({
    action: 'continue', caseId: ready.result.caseId, expectedRevision: 3, decision: 'approve',
  }, { agent: test.parent, signal: test.signal })
  assert.equal(completed.result.stage, 'complete')
  assert.equal(completed.result.status, 'complete')
  assert.equal(completed.agentsStarted, 0)
  assert.equal(test.starts.length, beforeComplete, 'final approval is a deterministic state transition')
}

{
  const test = setup()
  const stopped = await test.tool.execute({
    action: 'continue', state: stateFor('frame'), expectedRevision: 1, decision: 'defer',
  }, { agent: test.parent, signal: test.signal })
  assert.equal(stopped.result.status, 'deferred')
  assert.equal(stopped.agentsStarted, 0)
  assert.equal(test.starts.length, 0)
}

console.log('dsh-idea-validation tests passed')
