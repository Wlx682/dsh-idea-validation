import assert from 'node:assert/strict'
import { apply } from '../index.js'

let tool
let promptSection
const commands = new Map()
const context = {
  systemPrompt: { section(value) { promptSection = value } },
  tools: { register(value) { tool = value } },
  inject(_services, callback) {
    callback({ commands: { register(command) { commands.set(command.name, command) } } })
  },
}

apply(context)

assert.equal(tool.name, 'idea_validation')
assert.equal(tool.parameters.type, 'object')
assert.deepEqual(tool.parameters.properties.action.enum, ['start', 'continue'])
assert.equal(promptSection.name, 'tool:idea-validation')
assert.match(promptSection.text, /expansion-review/)
assert.match(promptSection.text, /detailQuestions/)
assert.deepEqual([...commands.keys()].sort(), ['idea-workflow', 'problem-discovery'])

const steered = []
const result = commands.get('idea-workflow').handler({
  agent: { steer(message) { steered.push(message) } },
  rawInput: '做一个读书 App',
})
assert.deepEqual(result, { kind: 'success', text: 'Idea workflow started.' })
assert.match(steered[0].content[0].text, /action=start/)
assert.match(steered[0].content[0].text, /逐项检查/)

console.log('dsh-idea-validation host-contract smoke passed')
