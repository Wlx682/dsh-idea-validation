import { randomUUID } from "node:crypto";
//#region lib/types/index.js
/**
* Explicit fixed problem-discovery workflow over the workflow engine.
* @module dsh-problem-discovery
*/
/** Cordis plugin name. */
const name = "problem-discovery";
/** Services required by the fixed workflow consumer. */
const inject = [
	"tools",
	"workflowEngine",
	"systemPrompt"
];
const WORKFLOW_META = {
	name: "problem-discovery",
	description: "Produce a challenged Problem Brief draft before Goal execution.",
	whenToUse: "The direct human explicitly asks to run problem discovery.",
	phases: [
		{
			title: "Collect",
			detail: "Scan authorized sources, deduplicate signals, and rank a bounded candidate list."
		},
		{
			title: "Discover",
			detail: "Frame the actor, friction, evidence, unknowns, and success signal."
		},
		{
			title: "Challenge",
			detail: "Remove unsupported assumptions and identify the next human decision."
		}
	]
};
/** The fixed three-agent workflow; callers provide data but cannot rewrite orchestration. */
const WORKFLOW_SCRIPT = String.raw`
const collectionSchema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rank: { type: 'integer' },
          signal: { type: 'string' },
          source: { type: 'string' },
          evidence: { type: 'string' },
          relevance: { type: 'string' },
        },
        required: ['rank', 'signal', 'source', 'evidence', 'relevance'],
        additionalProperties: false,
      },
    },
    coverageGaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['candidates', 'coverageGaps'],
  additionalProperties: false,
}

const briefSchema = {
  type: 'object',
  properties: {
    originalRequest: { type: 'string' },
    affectedActor: { type: 'string' },
    situation: { type: 'string' },
    friction: { type: 'string' },
    desiredChange: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    unknowns: { type: 'array', items: { type: 'string' } },
    successSignal: { type: 'string' },
    recommendation: { type: 'string', enum: ['proceed', 'defer', 'reject'] },
    focusedQuestion: { type: 'string' },
  },
  required: [
    'originalRequest', 'affectedActor', 'situation', 'friction', 'desiredChange',
    'evidence', 'unknowns', 'successSignal', 'recommendation', 'focusedQuestion',
  ],
  additionalProperties: false,
}

phase('Collect')
const collection = await agent([
  'Collect evidence candidates for the direct human request below before framing the problem.',
  'Use the preset\'s combined tool presentation. Prefer run_code for broad search, deduplication, and initial ranking; use native tools only when a direct observation is clearer.',
  'Never modify files or execute the requested implementation.',
  'Scan broadly within authorized sources, collapse semantic duplicates, and rank no more than 12 distinct candidates.',
  'For each candidate preserve a concrete source locator, the observed evidence, and why it may change the problem decision.',
  'Record important coverage gaps. This stage collects candidates; it does not decide the problem or recommend a solution.',
  'Direct human request:\n' + args.request,
].join('\n\n'), {
  label: 'Collect candidate evidence',
  phase: 'Collect',
  schema: collectionSchema,
})
if (collection === null) throw new Error('problem-discovery collector returned no evidence candidates')
if (!Array.isArray(collection.candidates) || collection.candidates.length > 12) {
  throw new Error('problem-discovery collector must return at most 12 candidates')
}
const candidateKeys = collection.candidates.map((item) =>
  item.signal.trim().toLowerCase() + '\u0000' + item.source.trim().toLowerCase())
if (new Set(candidateKeys).size !== candidateKeys.length) {
  throw new Error('problem-discovery collector returned duplicate candidates')
}
const ranks = collection.candidates.map((item) => item.rank)
if (new Set(ranks).size !== ranks.length || ranks.some((rank) => rank < 1 || rank > ranks.length)) {
  throw new Error('problem-discovery collector must rank candidates consecutively from 1')
}
collection.candidates.sort((left, right) => left.rank - right.rank)

phase('Discover')
const candidate = await agent([
  'Frame the problem in the direct human request below before any Goal or implementation starts.',
  'Use the bounded collection as candidate evidence, not as verified truth. Do not modify files or perform the requested implementation.',
  'Preserve the original request verbatim. Prefix every evidence item with Observed: or Inference:.',
  'Separate the affected actor, situation, friction, desired change, unknowns, and observable success signal.',
  'Choose proceed, defer, or reject as a recommendation, but do not make the human decision.',
  'End with exactly one focused question whose answer is most likely to change the next decision.',
  'Direct human request:\n' + args.request,
  'Collected candidates:\n' + JSON.stringify(collection),
].join('\n\n'), {
  label: 'Discover the problem',
  phase: 'Discover',
  schema: briefSchema,
})
if (candidate === null) throw new Error('problem-discovery framer returned no Problem Brief')

phase('Challenge')
const challenged = await agent([
  'Challenge the candidate Problem Brief below. Remove invented evidence and solution assumptions.',
  'Keep the original request verbatim. Preserve Observed: and Inference: labels and expose unresolved unknowns.',
  'Make the success signal observable. Keep exactly one focused question that can change proceed, defer, reject, or scope.',
  'Return a revised brief using the required schema. You cannot accept it for the direct human.',
  'Candidate Problem Brief:\n' + JSON.stringify(candidate),
].join('\n\n'), {
  label: 'Challenge the framing',
  phase: 'Challenge',
  schema: briefSchema,
})
if (challenged === null) throw new Error('problem-discovery challenger returned no Problem Brief')

return { brief: challenged }
`;
const DESCRIPTION = "Run the fixed three-agent problem-discovery workflow for one direct-human request. The Collect child uses the active Problem Discovery preset to scan authorized sources, deduplicate signals, and rank a bounded candidate list. The Discover and Challenge children frame the problem and remove unsupported assumptions. The result is a provisional Problem Brief draft. Present it to the direct human for revision or a proceed, defer, or reject decision. The workflow never creates a Goal or executes the requested implementation.";
const OUTPUT_PROPERTIES = {
		runId: { type: "string" },
		agentsStarted: { type: "integer" },
		result: {}
};
const TRUNCATION_NOTICE = "\n… [truncated]";
function resolveConfig(config) {
		const maxResultChars = config?.maxResultChars ?? 16e3;
	if (!Number.isSafeInteger(maxResultChars) || maxResultChars < 1) throw new TypeError("maxResultChars must be a positive safe integer");
	return { maxResultChars };
}
function asRecord(value) {
	if (value === null || Array.isArray(value) || typeof value !== "object") return void 0;
	return value;
}
/** Decode the fixed workflow result across the worker boundary. */
function readResult(value, originalRequest) {
	const envelope = asRecord(value);
	const brief = envelope === void 0 ? void 0 : asRecord(envelope["brief"]);
	if (envelope === void 0 || Object.keys(envelope).join(",") !== "brief" || brief === void 0) throw new Error("problem-discovery workflow returned a malformed result");
	const expectedKeys = [
		"affectedActor",
		"desiredChange",
		"evidence",
		"focusedQuestion",
		"friction",
		"originalRequest",
		"recommendation",
		"situation",
		"successSignal",
		"unknowns"
	].join(",");
	const textFieldsAreNormalized = [
		"originalRequest",
		"affectedActor",
		"situation",
		"friction",
		"desiredChange",
		"successSignal",
		"focusedQuestion"
	].every((key) => {
		const field = brief[key];
		return typeof field === "string" && field.length > 0 && field === field.trim();
	});
	const listsAreNormalized = ["evidence", "unknowns"].every((key) => {
		const field = brief[key];
		return Array.isArray(field) && field.every((item) => typeof item === "string" && item.length > 0 && item === item.trim());
	});
	if (Object.keys(brief).sort().join(",") !== expectedKeys || !textFieldsAreNormalized || !listsAreNormalized || brief["originalRequest"] !== originalRequest || brief["evidence"].length === 0 || !brief["evidence"].every((item) => /^(?:Observed|Inference):/.test(item)) || ![
		"proceed",
		"defer",
		"reject"
	].includes(String(brief["recommendation"]))) throw new Error("problem-discovery workflow returned a malformed Problem Brief");
	return { brief };
}
function stopReasonError(result) {
	switch (result.stopReason) {
		case "completed": return;
		case "cancelled": return `problem-discovery workflow was cancelled${result.error === void 0 ? "" : ` (${result.error})`}`;
		case "error": return `problem-discovery workflow failed: ${result.error ?? "unknown error"}`;
		/* v8 ignore start -- WorkflowStopReason is closed; a future variant must fail loud here. */
		default: return `problem-discovery workflow ended abnormally (${String(result.stopReason)})`;
	}
}
function boundResult(text, maxChars) {
	if (text.length <= maxChars) return text;
	const contentChars = maxChars - 14;
	return contentChars <= 0 ? TRUNCATION_NOTICE.substring(0, maxChars) : text.substring(0, contentChars).concat(TRUNCATION_NOTICE);
}
function renderResult(result, maxChars) {
	return boundResult(`Problem Brief draft from the problem-discovery workflow; direct-human review is required:\n${JSON.stringify(result.brief, null, 2)}`, maxChars);
}
function presentCall(args) {
		const request = asRecord(args)?.request;
		return {
			card: "generic",
			title: "problem discovery",
			rawInput: typeof request === "string" ? request : ""
		};
}
function presentResult(args, result) {
		void args;
		void result;
		return { card: "generic" };
}
function createUserMessage(input) {
		return Object.freeze({ ...input, id: randomUUID(), role: "user" });
}
/** Submit one direct-human command request to the root Agent. */
function startFromCommand(agent, rawInput) {
	const request = rawInput.trim();
	if (request.length === 0) return {
		kind: "error",
		text: "Usage: /problem-discovery <request>"
	};
	agent.steer(createUserMessage({
		content: [{
			type: "text",
			text: `Run the problem_discovery workflow exactly once for this request, then present its provisional brief and ask its focused question. Do not create a Goal.\n\n${request}`
		}],
		source: { kind: "user" }
	}));
	return {
		kind: "success",
		text: "Problem discovery started."
	};
}
async function runProblemDiscovery(ctx, parent, signal, request) {
	const run = ctx.workflowEngine.start({
		parent,
		args: { request },
		signal,
		meta: WORKFLOW_META,
		script: WORKFLOW_SCRIPT,
		maxTotalAgents: 3
	});
	const cancelForParent = () => {
		run.cancel("parent step aborted");
	};
	signal.addEventListener("abort", cancelForParent, { once: true });
	if (signal.aborted) cancelForParent();
	try {
		const settled = await run.result;
		const failure = stopReasonError(settled);
		if (failure !== void 0) throw new Error(failure);
		if (settled.agentsStarted !== 3) throw new Error(`problem-discovery workflow completed with ${settled.agentsStarted} agents; expected 3`);
		return {
			runId: run.id,
			agentsStarted: settled.agentsStarted,
			result: readResult(settled.value, request)
		};
	} finally {
		signal.removeEventListener("abort", cancelForParent);
		await run.dispose();
	}
}
/** Register the fixed workflow tool, its explicit command, and routing policy. */
function apply(ctx, config) {
	const resolved = resolveConfig(config);
	ctx.systemPrompt.section({
		name: "tool:problem-discovery",
		order: 117,
		text: "Use the problem_discovery tool ONLY when the direct human explicitly asks to run problem discovery. The active Problem Discovery preset exposes combined tool presentation: Collect prefers run_code for bounded scanning, deduplication, and initial ranking, while Discover and Challenge perform fresh semantic judgment over the typed handoff. Treat the result as a provisional draft: present it, ask its one focused question, and let the direct human revise or choose proceed, defer, or reject. Never create a Goal from the workflow result; Goal creation requires a later explicit human request."
	});
		ctx.tools.register({
			name: "problem_discovery",
			description: DESCRIPTION,
			parameters: {
				type: "object",
				properties: { request: {
					type: "string",
					description: "The direct human request to frame, preserved verbatim after trimming surrounding whitespace."
				} },
				required: ["request"],
				additionalProperties: false
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: OUTPUT_PROPERTIES,
					required: ["runId", "agentsStarted", "result"]
				},
			render: (_args, value) => [{
				type: "text",
				text: renderResult(value.result, resolved.maxResultChars)
			}]
		},
		async execute(args, exec) {
			const parent = exec.agent;
			if (parent === void 0) throw new Error("problem_discovery tool requires a calling agent (exec.agent was undefined)");
			const request = args.request.trim();
			if (request.length === 0) throw new Error("problem-discovery request must be a non-empty string");
			return runProblemDiscovery(ctx, parent, exec.signal, request);
		},
			presentCall,
			presentResult
		});
	ctx.inject(["commands"], (commandCtx) => {
		commandCtx.commands.register({
			name: "problem-discovery",
			description: "Run the problem-discovery workflow before Goal execution",
			input: { hint: "<request>" },
			handler: ({ agent, rawInput }) => startFromCommand(agent, rawInput)
		});
	});
}
//#endregion
export { apply, inject, name };
