import Anthropic from '@anthropic-ai/sdk';
import {
  getContext, getAttentionSummary, summarizePlans, getWorkloadSummary,
  getPlans, getPlanDetail,
} from './tools';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TURNS = 6;

// Static cache for the system prompt + tool definitions — these never vary,
// so we mark the system block as cacheable on every request.
const SYSTEM_PROMPT = `You are the TCP Tracker assistant, an executive aide for admins managing
traffic control plans, variances, and field operations.

# Your role
You help managers understand the state of their pipeline at a glance. You
are not a search tool or a data dump — you are an aide who reads the data
and reports what matters.

# Voice
- Direct and confident. Lead with the answer, not the methodology.
- One short paragraph or 2–4 bullets. Never a wall of text.
- Plain English. No jargon the user didn't use first.
- Never start with "Sure!" or "Great question." Just answer.

# Answer shape
Default to this structure, scaled to the question:
  1. Headline — the number or finding, in one sentence
  2. Context — is it normal, up, down, notable
  3. Exception — the one or two items driving it (by name if relevant)
  4. Offer — "Want the full list?" / "Should I check X?"

If the user asks for detail explicitly ("show me", "list them", "which
ones"), skip the offer and give the list. Otherwise stay high-level.

# What managers actually want
- Exceptions over inventory. "3 plans are stuck" beats "here are 47 plans."
- Drivers over totals. If a number moved, say why.
- Names only when they're outliers. Don't name every plan in a stage.
- Confidence about what's fine. If nothing needs attention, say so plainly.

# Tool use
- Always call a tool before answering a data question. Never guess numbers.
- Prefer summary tools (summarizePlans, getAttentionSummary, getWorkloadSummary)
  over row-returning tools. Reach for getPlans / getPlanDetail only when the
  user drills in or when an outlier needs explaining.
- Call getContext at the start of a session to anchor "today", "this week".
- If no tool can answer the question, say so and suggest what data would be
  needed. Don't invent.

# Domain glossary
- LOC: Letter of Credit, the primary identifier for a plan (e.g. "LOC-366")
- Stages (in order): Requested → Drafting → Submitted to DOT → DOT Review Cycle →
  TCP Approved → LOC Submitted → LOC Review Cycle → Plan Approved.
  After expiry: Resubmitted → Resubmit Review Cycle → TCP Approved (Final).
- "At DOT" means a plan is currently in DOT's queue (any review stage or
  awaiting first look).
- WATCH / Standard / Engineered: plan types with different clock targets.
- PHE: Peak Hour Exception variance — weekdays only.
- NV: Night Variance — weekends.
- CD: Council District concurrence (CD2/CD6/CD7).
- DIL / community notices: led by Paula (CR).
- MOT / DOT clock work: led by Garrett.
- Stuck: days in current stage exceeds the clock target for that stage/type.
- Overdue: needByDate has passed and plan isn't approved.
- Impacts: work requirements flagged on a plan. Keys → meaning:
  impact_fullClosure = full street closure, impact_driveway = driveway closures,
  impact_sidewalkClosure = sidewalk closure, impact_crosswalkClosure = crosswalk
  closure, impact_busStop = bus stop impacts, impact_transit = TANSAT needed,
  impact_i5Freeway = I-5 / Caltrans encroachment, impact_uprrBridge = UPRR bridge
  encroachment. A plan can carry several. Filter with the \`impact\` arg on
  summarizePlans / getPlans; summarizePlans also returns a byImpact breakdown.

# Dates and "needed in <month>"
- "Needed in <month>" / "due in <month>" / "coming up in <month>" refers to the
  plan's needByDate. Translate the month to an inclusive needByFrom/needByTo
  range (e.g. August 2026 → needByFrom "2026-08-01", needByTo "2026-08-31").
- Call getContext first so you know the current year; assume the next upcoming
  occurrence of a bare month name unless the user gives a year.
- Note when relevant that these tools only see active (open) plans — already
  approved or closed plans are excluded from the counts.

# Numbers and certainty
- Quote numbers exactly as returned by tools. Don't round unless you say so.
- If a tool returns 0 results, say so directly — don't soften it.
- Always use the human stage labels (e.g. "DOT Review Cycle"), never the
  underscore keys.

# What not to do
- Don't render markdown tables unless the user asks for a table.
- Don't list more than 5 items inline. If there are more, summarize and offer.
- Don't speculate about causes beyond what the data shows.
- Don't apologize for the data. Report it.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'getContext',
    description: 'Returns today\'s date, weekday, and the calling admin\'s email. Call this once at the start of a conversation to anchor relative dates like "this week" or "my plans".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'getAttentionSummary',
    description: 'Returns the high-level "what needs my attention" briefing: counts and top items across overdue, stuck, CD overdue, PHE upcoming, and stalled buckets. Includes a single topConcern ranked by severity. Use this for any "what should I look at" / "anything urgent" / morning-briefing question.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'summarizePlans',
    description: 'Returns aggregate counts and breakdowns (byStage, byLead, byType, byImpact, oldestDays, avg days in stage) for active plans matching optional filters. Use for "how many" / "what does the pipeline look like" / "Paula\'s plans" / "how many full closures in August" questions. Returns rollups, not rows. byImpact counts how many matched plans carry each impact.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type:        { type: 'string', enum: ['WATCH', 'Standard', 'Engineered'], description: 'Plan type filter' },
        lead:        { type: 'string', description: 'Filter to plans assigned to this lead (exact match)' },
        stage:       { type: 'string', description: 'Filter to a specific stage key (e.g. "dot_review")' },
        atDOT:       { type: 'boolean', description: 'True = only plans in any "at DOT" stage' },
        inDOTReview: { type: 'boolean', description: 'True = only plans actively in a DOT review cycle' },
        impact:      { type: 'string', enum: ['impact_driveway', 'impact_fullClosure', 'impact_sidewalkClosure', 'impact_crosswalkClosure', 'impact_busStop', 'impact_transit', 'impact_i5Freeway', 'impact_uprrBridge'], description: 'Only count plans carrying this impact. E.g. impact_fullClosure for full street closures.' },
        needByFrom:  { type: 'string', description: 'Inclusive lower bound on needByDate, ISO YYYY-MM-DD. Use with needByTo to bound a month (e.g. needByFrom "2026-08-01").' },
        needByTo:    { type: 'string', description: 'Inclusive upper bound on needByDate, ISO YYYY-MM-DD (e.g. needByTo "2026-08-31" for August).' },
      },
    },
  },
  {
    name: 'getWorkloadSummary',
    description: 'Returns open plan count and oldest item per lead. Use for "who is overloaded" / "Paula\'s queue" / "how is the team doing" questions.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'getPlans',
    description: 'Returns a capped list of individual plans matching filters, sorted by daysInStage desc. Use only when the user explicitly asks for a list, or when explaining why a number is unusual. Default limit 20, max 50.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type:           { type: 'string', enum: ['WATCH', 'Standard', 'Engineered'] },
        lead:           { type: 'string' },
        stage:          { type: 'string' },
        atDOT:          { type: 'boolean' },
        inDOTReview:    { type: 'boolean' },
        minDaysInStage: { type: 'number', description: 'Only include plans with at least this many days in current stage' },
        impact:         { type: 'string', enum: ['impact_driveway', 'impact_fullClosure', 'impact_sidewalkClosure', 'impact_crosswalkClosure', 'impact_busStop', 'impact_transit', 'impact_i5Freeway', 'impact_uprrBridge'], description: 'Only include plans carrying this impact' },
        needByFrom:     { type: 'string', description: 'Inclusive lower bound on needByDate, ISO YYYY-MM-DD' },
        needByTo:       { type: 'string', description: 'Inclusive upper bound on needByDate, ISO YYYY-MM-DD' },
        limit:          { type: 'number', description: 'Max plans to return (default 20, hard cap 50)' },
      },
    },
  },
  {
    name: 'getPlanDetail',
    description: 'Returns full detail for a single plan including the last 10 log entries. Use only when the user asks about a specific LOC, or to explain why a flagged plan is concerning.',
    input_schema: {
      type: 'object' as const,
      properties: {
        planId: { type: 'string', description: 'The plan LOC id, e.g. "LOC-366"' },
      },
      required: ['planId'],
    },
  },
];

async function runTool(
  name: string,
  input: Record<string, unknown>,
  databaseId: string,
  callerEmail: string,
): Promise<unknown> {
  switch (name) {
    case 'getContext':           return getContext(callerEmail);
    case 'getAttentionSummary':  return await getAttentionSummary(databaseId);
    case 'summarizePlans':       return await summarizePlans(databaseId, input);
    case 'getWorkloadSummary':   return await getWorkloadSummary(databaseId);
    case 'getPlans':             return await getPlans(databaseId, input);
    case 'getPlanDetail':        return await getPlanDetail(databaseId, input.planId as string);
    default: return { error: `Unknown tool: ${name}` };
  }
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  text: string;
  toolsUsed: string[];
}

export async function runAssistant(
  apiKey: string,
  databaseId: string,
  callerEmail: string,
  history: AssistantTurn[],
  userMessage: string,
): Promise<AssistantReply> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        toolsUsed.push(tu.name);
        try {
          const result = await runTool(tu.name, tu.input as Record<string, unknown>, databaseId, callerEmail);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          });
        } catch (e) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            is_error: true,
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Final answer
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    return { text: text || '(no response)', toolsUsed };
  }

  return { text: 'Took too many steps to answer — please rephrase or narrow the question.', toolsUsed };
}
