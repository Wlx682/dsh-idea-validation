import assert from 'node:assert/strict'
import { apply, inject, name } from './index.js'

const request = '验证用户是否真的需要批量整理反馈'
const brief = {
  originalRequest: request,
  affectedActor: '产品经理',
  situation: '每周整理多渠道反馈',
  friction: '相同问题重复出现但缺少统一证据',
  desiredChange: '形成可复核的问题候选列表',
  evidence: ['Observed: 三个渠道出现相同反馈'],
  unknowns: ['反馈是否来自同一批用户'],
  successSignal: '候选问题均能追溯到原始来源',
  recommendation: 'proceed',
  focusedQuestion: '哪些来源可以作为本轮判断依据？',
}

let registeredTool
let registeredCommand
let promptSection
let steeredMessage
let startSpec
let disposed = false

const context = {
  systemPrompt: {
    section(section) {
      promptSection = section
    },
  },
  tools: {
    register(tool) {
      registeredTool = tool
    },
  },
  inject(_services, callback) {
    callback({
      commands: {
        register(command) {
          registeredCommand = command
        },
      },
    })
  },
  workflowEngine: {
    start(spec) {
      startSpec = spec
      return {
        id: 'problem-discovery-test-run',
        result: Promise.resolve({
          stopReason: 'completed',
          agentsStarted: 3,
          value: { brief },
        }),
        cancel() {},
        async dispose() {
          disposed = true
        },
      }
    },
  },
}

apply(context)

assert.equal(name, 'problem-discovery')
assert.deepEqual(inject, ['tools', 'workflowEngine', 'systemPrompt'])
assert.equal(promptSection.name, 'tool:problem-discovery')
assert.equal(registeredTool.name, 'problem_discovery')
assert.deepEqual(registeredTool.parameters.required, ['request'])
assert.equal(registeredCommand.name, 'problem-discovery')

const commandResult = registeredCommand.handler({
  agent: {
    steer(message) {
      steeredMessage = message
    },
  },
  rawInput: `  ${request}  `,
})
assert.deepEqual(commandResult, { kind: 'success', text: 'Problem discovery started.' })
assert.equal(steeredMessage.role, 'user')
assert.equal(steeredMessage.source.kind, 'user')
assert.match(steeredMessage.content[0].text, new RegExp(request))

const controller = new AbortController()
const value = await registeredTool.execute(
  { request },
  { agent: { id: 'parent' }, signal: controller.signal },
)
assert.equal(startSpec.maxTotalAgents, 3)
assert.equal(startSpec.args.request, request)
assert.equal(value.agentsStarted, 3)
assert.deepEqual(value.result, { brief })
assert.equal(disposed, true)

const rendered = registeredTool.output.render({ request }, value)
assert.equal(rendered.length, 1)
assert.match(rendered[0].text, /Problem Brief draft/)
assert.match(rendered[0].text, /产品经理/)

console.log('dsh-problem-discovery tests passed')
