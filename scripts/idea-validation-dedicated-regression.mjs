import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { apply } from '../index.js'

const source = await readFile(new URL('../runtime.js', import.meta.url), 'utf8')
const preset = await readFile(new URL('../preset/agent.cordis.yml', import.meta.url), 'utf8')

assert.match(source, /maxTotalAgents: 1/)
assert.match(source, /Repair only the \$\{stage\} payload/)
assert.match(source, /outside authorizedSources/)
assert.match(source, /stale case revision/)
assert.match(source, /cannot be called from a workflow child or delegated subagent/)
assert.doesNotMatch(preset, /dsh-tool-fs-search/)
assert.match(preset, /@deepseek-ai\/dsh-tool-ask-user/)
assert.match(preset, /ask_user_question/)
assert.match(preset, /mode: native/)

const empty = {
  ideaType: 'process', clarifications: [], openQuestions: [],
  problem: { actor: '', situation: '', observedPain: '', impact: '', desiredOutcome: '', constraints: [], decisionToMake: '' },
  assumptions: [], riskiestAssumption: '',
  evidencePlan: { question: '', method: '', sources: [], passSignal: '', failSignal: '' },
  evidence: [], validationSummary: { outcome: 'not-run', rationale: '', remainingUncertainty: '' },
  options: [], selectedOption: '',
  experiment: {
    smallestSlice: '', intervention: '', comparison: '', primaryMetric: '', guardrails: [], baseline: '',
    passThreshold: '', failThreshold: '', duration: '', owner: '', authorityBoundary: '', dependencies: [],
  },
  criticalPath: [],
  implementationHandoff: { objective: '', scopeIn: [], scopeOut: [], acceptanceCriteria: [], instrumentation: [], rollback: '', nextAction: '' },
}
const repaired = structuredClone(empty)
repaired.openQuestions = ['这次要改变的是产品需求质量，还是研发执行效率？']

let tool
const starts = []
const queue = [empty, repaired]
const context = {
  systemPrompt: { section() {} },
  tools: { register(value) { tool = value } },
  inject() {},
  workflowEngine: {
    start(spec) {
      starts.push(spec)
      return {
        id: `dedicated-${starts.length}`,
        result: Promise.resolve({ stopReason: 'completed', agentsStarted: 1, value: { payload: queue.shift() } }),
        cancel() {},
        async dispose() {},
      }
    },
  },
}
apply(context)
const args = {
  action: 'start',
  request: '我觉得团队从提需求开始就有问题，想设计一个工作流快速验证想法',
}
const first = await tool.execute(args, { agent: { id: 'dedicated-parent' }, signal: new AbortController().signal })
assert.equal(first.result.stage, 'clarify')
assert.equal(first.agentsStarted, 2, 'only the malformed clarify stage should be repaired')
assert.deepEqual(starts.map(item => item.args.phaseTitle), ['clarify', 'clarify'])
assert.ok(starts.every(item => item.maxTotalAgents === 1))
assert.match(starts[1].args.prompt, /Repair only the clarify payload/)
assert.doesNotMatch(starts[0].args.prompt, /tmp\/PRD-好问题社区\.md/)

const duplicate = await tool.execute(args, { agent: { id: 'dedicated-parent' }, signal: new AbortController().signal })
assert.equal(duplicate.result.caseId, first.result.caseId)
assert.equal(starts.length, 2, 'an identical start must not spawn another workflow')

console.log('idea-validation dedicated regression passed')
