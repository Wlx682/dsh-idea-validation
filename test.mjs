import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject, name } from './index.js'

function ideaDialogueAt(round = 1) {
  const layers = [
    { id: 'purpose-value', title: '目标价值', content: '减少目标偏离与无效返工', status: 'confirmed', note: '直接来自用户原始想法' },
    { id: 'user-scenario', title: '用户场景', content: '可能由产品负责人或研发负责人发起', status: 'conflict', note: '原始描述涉及团队但未明确首要使用者' },
    { id: 'scope-boundary', title: '范围边界', content: '先覆盖想法提出到方案形成', status: 'inferred', note: '需要后续确认是否包含开发执行' },
    { id: 'core-mechanism', title: '关键机制', content: '逐轮发现遗漏并纠正矛盾', status: 'inferred', note: '根据用户对交互方式的要求推测' },
    { id: 'constraints-resources', title: '约束资源', content: '', status: 'missing', note: '尚未说明试点团队与投入边界' },
    { id: 'success-criteria', title: '成功标准', content: '', status: 'missing', note: '尚未定义何时算想法已经足够完善' },
  ]
  const resolve = (id, content, note) => Object.assign(layers.find(layer => layer.id === id), { content, status: 'confirmed', note })
  if (round >= 2) resolve('user-scenario', '由研发团队负责人在需求进入开发前发起', '来自用户选择')
  if (round >= 3) resolve('constraints-resources', '先用一个真实想法试点', '来自用户选择')
  if (round >= 4) resolve('success-criteria', '无未解决矛盾且能进入问题验证', '来自用户选择')
  if (round >= 5) resolve('scope-boundary', '覆盖想法提出到问题框架形成，不直接实施', '来自用户修正')
  if (round >= 6) resolve('core-mechanism', '逐轮处理一个遗漏或矛盾', '来自用户要求')

  const focuses = {
    1: {
      kind: 'conflict', layerId: 'user-scenario', question: '首轮工作流应该优先服务谁？',
      context: '当前草案同时存在产品负责人和研发负责人两个发起角色，需要先确定主角色。',
      options: [
        { label: '研发负责人', description: '从研发团队目标与交付决策开始。' },
        { label: '产品负责人', description: '从产品想法和需求定义开始。' },
        { label: '想法提出者', description: '不限定岗位，任何人都能发起。' },
      ],
    },
    2: {
      kind: 'missing', layerId: 'constraints-resources', question: '第一轮试点准备控制在什么范围？',
      context: '主角色已经明确，下一步需要确定最小投入边界。',
      options: [
        { label: '一个真实想法', description: '用一个 case 跑完整流程。' },
        { label: '一个研发小组', description: '在固定团队内连续试用。' },
      ],
    },
    3: {
      kind: 'missing', layerId: 'success-criteria', question: '什么信号代表想法已经补充到可以继续？',
      context: '角色和试点范围已经明确，但结束条件仍缺失。',
      options: [
        { label: '无关键矛盾', description: '关键层次不存在未解决冲突。' },
        { label: '可形成验证问题', description: '信息足以定义下一步验证问题。' },
      ],
    },
    4: {
      kind: 'inference', layerId: 'scope-boundary', question: '这套完善流程应该停在哪个交付点？',
      context: '缺失项已经补齐，需要确认推测的流程边界。',
      options: [
        { label: '问题框架', description: '完善后进入问题与假设验证。' },
        { label: '执行计划', description: '继续生成可执行实施计划。' },
      ],
    },
    5: {
      kind: 'inference', layerId: 'core-mechanism', question: '每轮只处理一个关键点是否作为固定规则？',
      context: '其余层次已经确认，只剩核心交互机制仍是推测。',
      options: [
        { label: '固定单焦点', description: '每轮只讨论一个遗漏或矛盾。' },
        { label: '允许相关双焦点', description: '强相关问题可以同轮处理。' },
      ],
    },
    6: { kind: 'none', layerId: '', question: '', context: '', options: [] },
  }
  const changes = [
    '根据原始想法建立第一版分层草案。',
    '已确认先服务研发团队负责人。',
    '已确认先用一个真实想法试点。',
    '已确认无关键矛盾且能形成验证问题才算补全。',
    '已确认完善阶段停在问题框架，不直接实施。',
    '已确认每轮固定只处理一个关键点。',
  ]
  return {
    summary: round === 1 ? '团队想通过工作流减少目标偏离和返工，但使用场景与边界尚未对齐。' : '研发负责人通过单焦点对话把模糊想法补成可验证的问题框架。',
    round,
    lastChange: changes[round - 1],
    layers,
    nextFocus: focuses[round],
    progress: { resolved: round, total: 6 },
  }
}

function completeIdeaDialogue() {
  return ideaDialogueAt(6)
}

function emptyIdeaDialogue() {
  return {
    summary: '', round: 0, lastChange: '', layers: [],
    nextFocus: { kind: 'none', layerId: '', question: '', context: '', options: [] },
    progress: { resolved: 0, total: 0 },
  }
}

function payloadFor(stage) {
  const payload = {
    ideaType: 'process',
    clarifications: [],
    openQuestions: [],
    clarificationQuestions: [],
    ideaExpansion: {
      mission: '', successMetric: '', audiences: [], primaryRoute: '', alternativeRoutes: [], risks: [],
      resources: { people: '', budget: '', timeline: '' }, deliverables: [], assumptionNotice: '',
    },
    ideaDialogue: stage === 'clarify' ? ideaDialogueAt() : completeIdeaDialogue(),
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

function dialoguePayload(round) {
  const payload = payloadFor('clarify')
  payload.ideaDialogue = ideaDialogueAt(round)
  payload.clarifications = Array.from({ length: round - 1 }, (_, index) => ({
    question: `第 ${index + 1} 轮焦点`, answer: `第 ${index + 1} 轮用户答案`,
  }))
  return payload
}

function legacyClarifyPayload() {
  const payload = payloadFor('clarify')
  payload.ideaDialogue = emptyIdeaDialogue()
  payload.ideaExpansion = {
    mission: '', successMetric: '', audiences: [], primaryRoute: '', alternativeRoutes: [], risks: [],
    resources: { people: '', budget: '', timeline: '' }, deliverables: [], assumptionNotice: '',
  }
  payload.openQuestions = ['你希望以什么形态落地？', '首个试点选择哪条业务流程？', '优先用什么指标判断成功？']
  payload.clarificationQuestions = [
    {
      id: 'landing-shape', header: '落地形态', question: payload.openQuestions[0], multiSelect: false,
      options: [
        { label: '个人方法论', description: '先形成一个人可重复使用的方法。' },
        { label: '团队工作流', description: '直接形成团队共同执行的流程。' },
      ],
    },
    {
      id: 'first-pilot', header: '首个试点', question: payload.openQuestions[1], multiSelect: false,
      options: [
        { label: '需求到发布', description: '验证完整的需求交付链路。' },
        { label: '团队协作', description: '先验证角色之间的协作流程。' },
      ],
    },
    {
      id: 'success-metric', header: '成功指标', question: payload.openQuestions[2], multiSelect: false,
      options: [
        { label: '返工率', description: '观察实现后返工是否减少。' },
        { label: '交付周期', description: '观察从需求到交付是否缩短。' },
      ],
    },
  ]
  return payload
}

function legacyExpansionPayload() {
  const payload = payloadFor('clarify')
  payload.ideaDialogue = emptyIdeaDialogue()
  payload.ideaExpansion = {
    mission: '把模糊想法变成可快速删改的默认行动蓝图',
    successMetric: '两轮选择内形成可进入方案验证的问题框架',
    audiences: [
      { label: '点子提出者', need: '不想填写需求表', scenario: '刚产生模糊想法时' },
      { label: '研发负责人', need: '快速判断是否值得投入', scenario: '评审研发流程改进时' },
      { label: '产品负责人', need: '获得可讨论的默认靶子', scenario: '需求尚未成形时' },
    ],
    primaryRoute: '生成六维默认草案后由用户只标记偏差',
    alternativeRoutes: ['一键接受全部默认项', '逐维删除或修正偏移项'],
    risks: ['脑补被误当成事实', '默认锚点误导决策', '逐项确认仍然过重'],
    resources: { people: '1 名想法负责人', budget: '先零新增预算试点', timeline: '一个真实想法周期' },
    deliverables: ['六维想法扩展草案', '经用户删改后的确认版本'],
    assumptionNotice: '以下全部内容均为基于通用逻辑的待确认推测，不是用户事实或证据。',
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
function setup({ config, cwd } = {}) {
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
  apply(context, config)
  const parent = {
    id: `parent-${++parentCounter}`,
    ...(cwd === undefined ? {} : { session: { header: { cwd } } }),
  }
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
  assert.match(test.promptSection.text, /ask_user_question/)
  assert.match(test.promptSection.text, /CARD_HANDOFF/)
  assert.equal(test.tool.name, 'idea_validation')
  assert.deepEqual([...test.commands.keys()].sort(), ['idea-workflow', 'problem-discovery'])
  const steered = []
  const commandResult = test.commands.get('idea-workflow').handler({
    agent: { steer(message) { steered.push(message) } }, rawInput: '  验证一个研发流程想法  ',
  })
  assert.deepEqual(commandResult, { kind: 'success', text: 'Idea workflow started.' })
  assert.match(steered[0].content[0].text, /Do not research or draft a parallel brief/)
  assert.match(steered[0].content[0].text, /ask_user_question/)
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
  assert.equal(started.result.persistence, undefined, '无 cwd 宿主应保持原有内存模式')
  assert.deepEqual(started.result.gate.allowedDecisions, ['revise', 'defer', 'reject'])
  assert.equal(test.starts[0].maxTotalAgents, 1)
  assert.equal(test.starts[0].args.phaseTitle, 'clarify')
  assert.doesNotMatch(test.starts[0].args.prompt, /Scan broadly/)

  const duplicateStart = await test.tool.execute(args, { agent: test.parent, signal: test.signal })
  assert.equal(duplicateStart.result.caseId, started.result.caseId)
  assert.equal(test.starts.length, 1, 'identical starts must be idempotent')

  const rendered = test.tool.output.render(args, started)[0].text
  assert.match(rendered, /STATE_SNAPSHOT/)
  assert.match(rendered, /CARD_HANDOFF/)
  assert.match(rendered, /ask_user_question/)
  const handoff = JSON.parse(rendered.match(/CARD_HANDOFF \(mandatory root-agent protocol\):\n([\s\S]*?)\nPass caseId/)[1])
  assert.equal(handoff.questions.length, 1)
  assert.equal(handoff.questions[0].header, '第1步·用户场景')
  assert.match(handoff.questions[0].question, /当前草案/)
  assert.match(handoff.questions[0].question, /本轮只处理/)
  assert.doesNotMatch(handoff.questions[0].question, /全盘通过|六张/)
  assert.equal(handoff.answerProtocol.mode, 'dialogue-step')
  assert.equal(handoff.answerProtocol.decision, 'revise')
  assert.equal(handoff.answerProtocol.answersBecomeHumanResponse, true)
  assert.deepEqual(handoff.answerProtocol.progress, { resolved: 1, total: 6, round: 1 })
  assert.match(rendered, new RegExp(started.result.caseId))

  await assert.rejects(
    test.tool.execute({
      action: 'continue', caseId: started.result.caseId, expectedRevision: 1, decision: 'continue',
      humanResponse: '跳过对话直接进入下一阶段',
    }, { agent: test.parent, signal: test.signal }),
    /idea dialogue is not complete/,
  )

  test.enqueue(dialoguePayload(2))
  const firstAnswer = {
    action: 'continue', caseId: started.result.caseId, expectedRevision: 1, decision: 'revise',
    humanResponse: JSON.stringify([{ id: handoff.questions[0].id, selected: ['研发负责人'] }]),
  }
  const second = await test.tool.execute(firstAnswer, { agent: test.parent, signal: test.signal })
  assert.equal(second.result.stage, 'clarify')
  assert.equal(second.result.revision, 2)
  assert.equal(second.result.payload.ideaDialogue.nextFocus.layerId, 'constraints-resources')
  assert.match(test.starts[1].args.prompt, /研发负责人/)

  const duplicateAnswer = await test.tool.execute(firstAnswer, { agent: test.parent, signal: test.signal })
  assert.equal(duplicateAnswer.result.revision, 2)
  assert.equal(test.starts.length, 2, 'an identical dialogue answer must not rerun the stage')

  let completedDraft = second
  for (let nextRound = 3; nextRound <= 6; nextRound += 1) {
    test.enqueue(dialoguePayload(nextRound))
    completedDraft = await test.tool.execute({
      action: 'continue', caseId: started.result.caseId, expectedRevision: nextRound - 1, decision: 'revise',
      humanResponse: JSON.stringify([{ id: `idea-dialogue-round-${nextRound - 1}`, selected: [`第 ${nextRound - 1} 轮答案`] }]),
    }, { agent: test.parent, signal: test.signal })
    assert.equal(completedDraft.result.stage, 'clarify')
    assert.equal(completedDraft.result.revision, nextRound)
  }
  assert.equal(completedDraft.result.stage, 'clarify')
  assert.equal(completedDraft.result.revision, 6)
  const completionHandoff = JSON.parse(test.tool.output.render({}, completedDraft)[0].text.match(/CARD_HANDOFF \(mandatory root-agent protocol\):\n([\s\S]*?)\nPass caseId/)[1])
  assert.equal(completionHandoff.answerProtocol.mode, 'dialogue-complete')
  assert.deepEqual(completionHandoff.answerProtocol.selected.find((item) => item.label === '进入问题定义'), {
    label: '进入问题定义', decision: 'continue', humanResponse: '分层想法草案已补全，进入问题定义。',
  })

  test.enqueue(payloadFor('frame'))
  const continueArgs = {
    action: 'continue', caseId: started.result.caseId, expectedRevision: 6, decision: 'continue',
    humanResponse: '分层想法草案已补全，进入问题定义。',
  }
  const framed = await test.tool.execute(continueArgs, { agent: test.parent, signal: test.signal })
  assert.equal(framed.result.stage, 'frame')
  assert.equal(framed.result.revision, 7)

  await assert.rejects(
    test.tool.execute({ ...continueArgs, decision: 'revise', humanResponse: '不同反馈' }, { agent: test.parent, signal: test.signal }),
    /stale case revision/,
  )
}

{
  const test = setup()
  test.enqueue(payloadFor('clarify'))
  const started = await test.tool.execute({ action: 'start', request: '保护逐轮已确认内容' }, { agent: test.parent, signal: test.signal })
  const evolved = dialoguePayload(2)
  evolved.ideaDialogue.layers.find(layer => layer.id === 'purpose-value').content = '模型擅自改写已确认目标'
  evolved.ideaDialogue.layers.find(layer => layer.id === 'scope-boundary').content = '结合新角色信息，推测只覆盖问题框架形成'
  Object.assign(evolved.ideaDialogue.layers.find(layer => layer.id === 'success-criteria'), {
    content: '模型顺手给出的成功标准', status: 'confirmed', note: '并非当前焦点的用户回答',
  })
  evolved.ideaDialogue.progress.resolved = 3
  test.enqueue(evolved)
  const advanced = await test.tool.execute({
    action: 'continue', caseId: started.result.caseId, expectedRevision: 1, decision: 'revise',
    humanResponse: JSON.stringify([{ id: 'idea-dialogue-user', selected: ['研发负责人'] }]),
  }, { agent: test.parent, signal: test.signal })
  assert.equal(advanced.agentsStarted, 1)
  assert.equal(test.starts.length, 2, 'history projection must not consume a repair attempt')
  const layers = Object.fromEntries(advanced.result.payload.ideaDialogue.layers.map(layer => [layer.id, layer]))
  assert.equal(layers['purpose-value'].content, '减少目标偏离与无效返工')
  assert.equal(layers['scope-boundary'].content, '结合新角色信息，推测只覆盖问题框架形成')
  assert.equal(layers['scope-boundary'].status, 'inferred')
  assert.equal(layers['success-criteria'].status, 'missing')
  assert.equal(layers['success-criteria'].content, '')
}

{
  const test = setup()
  test.enqueue(legacyExpansionPayload())
  const started = await test.tool.execute({ action: 'start', request: '兼容旧六维扩展' }, { agent: test.parent, signal: test.signal })
  const handoff = JSON.parse(test.tool.output.render({}, started)[0].text.match(/CARD_HANDOFF \(mandatory root-agent protocol\):\n([\s\S]*?)\nPass caseId/)[1])
  assert.equal(handoff.answerProtocol.mode, 'expansion-review')
  assert.equal(handoff.answerProtocol.detailQuestions.length, 6)
}

{
  const test = setup()
  test.enqueue(payloadFor('options'))
  const options = await test.tool.execute({
    action: 'continue', state: stateFor('evidence-result'), expectedRevision: 1, decision: 'approve',
  }, { agent: test.parent, signal: test.signal })
  const rendered = test.tool.output.render({}, options)[0].text
  assert.match(rendered, /轻量价值门禁/)
  assert.match(rendered, /完整流程重构/)
  assert.match(rendered, /"decision": "approve"/)
  assert.match(rendered, /"customDecision": "revise"/)
}

{
  const test = setup()
  const invalid = payloadFor('clarify')
  invalid.ideaDialogue.nextFocus = {
    kind: 'missing', layerId: 'constraints-resources', question: '第一轮试点准备控制在什么范围？',
    context: '尚未说明试点投入边界。',
    options: [
      { label: '一个真实想法', description: '用一个 case 试点。' },
      { label: '一个研发小组', description: '在固定团队试点。' },
    ],
  }
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
  assert.match(test.starts[1].args.prompt, /resolve a conflict before/)
  assert.equal(test.disposed, 2)
}

{
  const test = setup()
  const embeddedChoices = legacyClarifyPayload()
  embeddedChoices.openQuestions[0] = '你希望以什么形态落地：a) 个人方法论 b) 团队工作流 c) 团队推广？'
  embeddedChoices.clarificationQuestions[0].question = embeddedChoices.openQuestions[0]
  test.enqueue(embeddedChoices)
  test.enqueue(legacyClarifyPayload())
  const repaired = await test.tool.execute(
    { action: 'start', request: '拒绝把三个选项塞进一个问题' },
    { agent: test.parent, signal: test.signal },
  )
  assert.equal(repaired.agentsStarted, 2)
  assert.match(test.starts[1].args.prompt, /must not embed enumerated choices/)
  const handoff = JSON.parse(test.tool.output.render({}, repaired)[0].text.match(/CARD_HANDOFF \(mandatory root-agent protocol\):\n([\s\S]*?)\nPass caseId/)[1])
  assert.equal(handoff.questions.length, 3)
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

await assert.rejects(async () => {
  setup({ config: { stateDir: '../outside-workspace' }, cwd: '/workspace' })
}, /stateDir.*relative|stateDir.*workspace/)

{
  const cwd = await mkdtemp(join(tmpdir(), 'idea-validation-symlink-'))
  const outside = await mkdtemp(join(tmpdir(), 'idea-validation-outside-'))
  try {
    await symlink(outside, join(cwd, 'linked'))
    const test = setup({ cwd, config: { stateDir: 'linked' } })
    test.enqueue(payloadFor('clarify'))
    await assert.rejects(
      test.tool.execute(
        { action: 'start', request: '不允许符号链接越界' },
        { agent: test.parent, signal: test.signal },
      ),
      /symbolic links|escapes the workspace/,
    )
    assert.deepEqual(await readdir(outside), [])
  } finally {
    await rm(cwd, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
}

{
  const cwd = await mkdtemp(join(tmpdir(), 'idea-validation-persist-'))
  try {
    const firstHost = setup({ cwd })
    firstHost.enqueue(payloadFor('clarify'))
    const started = await firstHost.tool.execute(
      { action: 'start', request: '跨进程恢复想法' },
      { agent: firstHost.parent, signal: firstHost.signal },
    )
    assert.equal(started.result.persistence.caseFile, `.dsh/idea-validation/cases/${started.result.caseId}.json`)
    const storedStart = JSON.parse(await readFile(join(cwd, started.result.persistence.caseFile), 'utf8'))
    assert.equal(storedStart.caseId, started.result.caseId)
    assert.equal(storedStart.revision, 1)

    const restartedHost = setup({ cwd })
    restartedHost.enqueue(dialoguePayload(2))
    const resumed = await restartedHost.tool.execute({
      action: 'continue',
      caseId: started.result.caseId,
      expectedRevision: 1,
      decision: 'revise',
      humanResponse: JSON.stringify([{ id: 'persisted-answer', selected: ['研发负责人'] }]),
    }, { agent: restartedHost.parent, signal: restartedHost.signal })
    assert.equal(resumed.result.revision, 2)
    assert.equal(resumed.result.payload.ideaDialogue.nextFocus.layerId, 'constraints-resources')
    const storedResume = JSON.parse(await readFile(join(cwd, resumed.result.persistence.caseFile), 'utf8'))
    assert.equal(storedResume.revision, 2)
    assert.deepEqual((await readdir(join(cwd, '.dsh/idea-validation/cases'))).filter(name => name.includes('.tmp-')), [])
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

{
  const cwd = await mkdtemp(join(tmpdir(), 'idea-validation-export-'))
  try {
    const test = setup({ cwd })
    const completed = await test.tool.execute({
      action: 'continue', state: stateFor('implementation'), expectedRevision: 1, decision: 'approve',
    }, { agent: test.parent, signal: test.signal })
    assert.equal(completed.result.status, 'complete')
    assert.match(completed.result.persistence.handoffFile, /^Plans\/想法验证\/.+\.md$/)
    const handoff = await readFile(join(cwd, completed.result.persistence.handoffFile), 'utf8')
    assert.match(handoff, /^# 想法验证交接/m)
    assert.match(handoff, /## 目标/)
    assert.match(handoff, /## Scope In/)
    assert.match(handoff, /## 验收标准/)
    assert.match(handoff, /## 埋点/)
    assert.match(handoff, /## 回滚/)
    assert.match(handoff, /## 关键路径/)
    const storedComplete = JSON.parse(await readFile(join(cwd, completed.result.persistence.caseFile), 'utf8'))
    assert.equal(storedComplete.persistence.handoffFile, completed.result.persistence.handoffFile)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

console.log('dsh-idea-validation tests passed')
