import Groq from "groq-sdk";
import { ScoredCompany, ThesisCriteria, InvestigationEvent } from "./types";
import { toolDefinitions, executeTool, summarizeToolResult } from "./sources";

function getClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

export async function parseThesis(thesis: string): Promise<ThesisCriteria> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: `Parse this startup investment thesis into structured criteria. Return JSON only, no markdown.

Thesis: "${thesis}"

Return this exact JSON shape:
{
  "industry": "primary industry/sector",
  "stage": "startup stage (seed, series A, growth, etc)",
  "signals": ["list of signals to prioritize like hiring, github_activity, funding, launches"],
  "keywords": ["specific keywords to match against company descriptions"],
  "raw": "the original thesis"
}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 512,
  });

  const text = response.choices[0]?.message?.content || "";
  try {
    return JSON.parse(extractJSON(text));
  } catch {
    return {
      industry: "technology",
      stage: "any",
      signals: ["hiring", "github", "funding", "launches"],
      keywords: thesis
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
      raw: thesis,
    };
  }
}

const SYSTEM_PROMPT = `You are Tipoff, a startup breakout discovery agent. A user gives you an investment thesis and you investigate across multiple data sources to find startups that are ABOUT TO break out — not ones that already have.

You have tools that search different data sources. Use them strategically:

1. You MUST call AT LEAST 4 DISTINCT sources before producing your final ranking. Aim for 4-6. The full set is: search_yc, search_hackernews, search_github, search_sec_edgar, search_news, search_crunchbase, search_twitter. Do not stop after 2 sources — coverage breadth is required.
2. Apify Store runs power search_github, search_news, search_crunchbase, search_twitter, and scrape_website. When those tools are available (they return real results, not "unconfigured"), you MUST include at least one of search_news, search_crunchbase, or search_twitter in every investigation so funding/news/social signals use Apify.
3. search_twitter is the BEST source for HIRING SIGNALS — it captures companies tweeting "we're hiring", real-time launches, and engagement-validated buzz. Use it whenever the thesis mentions hiring, "actively scaling", launches, or buzz. The other sources rarely surface hiring evidence.
3. REVIEW results after each search. Think about what you found and what's missing. If a source returns nothing, try a different source — don't just stop.
4. FOLLOW LEADS — if a company looks promising, use scrape_website to learn more about them. If scrape_website fails, do NOT invent details about that company.
5. Once you've covered 4+ sources and have evidence on your candidates, compile your final ranked list.

EVIDENCE RULE (CRITICAL): You may ONLY mark a signal as true if a tool result you actually received contained evidence of it. Examples:
- signals.hiring = true ONLY if search_twitter found hiring tweets for that company, OR a scrape_website / news result mentioned hiring or open roles. search_twitter is the primary hiring source.
- signals.github = true ONLY if search_github returned that company OR a result text mentioned a GitHub repo for them.
- signals.funding = true ONLY if search_sec_edgar, search_crunchbase, search_news, or search_twitter returned funding evidence (Form D filing, round amount, "raised $X", tweet about closing a round).
- signals.launches = true ONLY if search_hackernews (Show HN), search_yc, or search_twitter (launch tweets) returned them.
If you did not see evidence in a tool result, the signal is FALSE. Do not infer or guess.

BREAKOUT TARGETING (CRITICAL): The goal is companies with momentum, not maturity. Apply these scoring rules:
- PENALIZE GitHub repos with >5,000 stars heavily — these have already broken out. Cap their score at 60.
- PENALIZE GitHub repos with >20,000 stars further — cap their score at 40. Mention this in reasoning.
- REWARD GitHub repos with <1,000 stars but high recent growth or engagement.
- REWARD recent YC batches (W24, S24, F24, W25, S25), recent Show HN posts, recent SEC Form D filings, recent funding announcements.
- REWARD early-stage indicators: seed, pre-seed, just-launched, just-filed, just-raised.

REASONING RULE (CRITICAL): Reasoning MUST cite specific numbers or identifiers from tool results — star counts, batch IDs (e.g. "W25"), Form D filing dates, funding amounts, HN scores. BANNED phrases when used without numbers: "strong growth potential", "promising", "indicating momentum", "high potential", "actively scaling". Every claim must be backed by a number or specific fact you observed.

IMPORTANT: Think out loud before every tool call. Explain WHY you're choosing this tool and what you expect to find. Your reasoning is displayed live to the user — make it insightful.

When you are done investigating, output your final rankings as a JSON block like this:

\`\`\`json
{
  "companies": [
    {
      "name": "Company Name",
      "url": "https://...",
      "description": "What they do",
      "score": 85,
      "reasoning": "2-3 sentences with SPECIFIC numbers from tool results. e.g. 'YC W25 batch, 340 HN points on Show HN launch, 820 GitHub stars growing fast.'",
      "sources": ["github", "hackernews"],
      "signals": {"hiring": false, "github": true, "funding": false, "launches": true}
    }
  ]
}
\`\`\`

Rank by breakout potential (0-100). Favor early-momentum signals over maturity. Reasoning must contain digits.`;

export async function runAgentLoop(
  thesis: string,
  criteria: ThesisCriteria,
  onEvent: (event: InvestigationEvent) => void
): Promise<ScoredCompany[]> {
  const client = getClient();
  const MAX_ITERATIONS = 12;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Investigate this thesis: "${thesis}"

Parsed criteria:
- Industry: ${criteria.industry}
- Stage: ${criteria.stage}
- Key signals: ${criteria.signals.join(", ")}
- Keywords: ${criteria.keywords.join(", ")}

Start your investigation. Think about which sources will be most useful for this specific thesis, then begin searching.`,
    },
  ];

  const seenToolCalls = new Set<string>();
  const usedSources = new Set<string>();
  const ALL_SEARCH_SOURCES = [
    "search_yc",
    "search_hackernews",
    "search_github",
    "search_sec_edgar",
    "search_news",
    "search_crunchbase",
    "search_twitter",
  ];
  let nudged = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Rate limit buffer
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools: toolDefinitions,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 4096,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Add assistant message to history
    messages.push(assistantMessage);

    // Stream reasoning
    if (assistantMessage.content) {
      onEvent({
        type: "thinking",
        message: assistantMessage.content,
        iteration: i + 1,
      });
    }

    // If no tool calls, agent is done — but check coverage first
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      // Coverage nudge: if fewer than 4 distinct sources used, push back once
      if (!nudged && usedSources.size < 4) {
        const unused = ALL_SEARCH_SOURCES.filter((s) => !usedSources.has(s));
        const nudgeMsg = `You have only used ${usedSources.size} sources (${Array.from(usedSources).join(", ") || "none"}). The investigation requires at least 4 distinct sources before final ranking. Use at least one more from: ${unused.join(", ")}. Then output your final JSON.`;
        messages.push({ role: "user", content: nudgeMsg });
        onEvent({
          type: "status",
          message: `Coverage check: only ${usedSources.size} sources used — nudging agent.`,
          iteration: i + 1,
        });
        nudged = true;
        continue;
      }

      // Parse final results from the message
      if (assistantMessage.content) {
        return parseFinalResults(assistantMessage.content);
      }
      break;
    }

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const { name } = toolCall.function;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      // Deduplicate: skip if we already ran this exact call
      const callKey = `${name}:${JSON.stringify(args)}`;
      if (seenToolCalls.has(callKey)) {
        const skipMsg = `Already searched this — try different parameters or finish your investigation.`;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: skipMsg,
        });
        onEvent({
          type: "tool_result",
          message: skipMsg,
          toolName: name,
          iteration: i + 1,
        });
        continue;
      }
      seenToolCalls.add(callKey);

      // Track distinct search sources used (for coverage nudge)
      if (ALL_SEARCH_SOURCES.includes(name)) {
        usedSources.add(name);
      }

      // Stream tool call event
      onEvent({
        type: "tool_call",
        toolName: name,
        toolArgs: args,
        iteration: i + 1,
      });

      // Execute the tool
      try {
        const result = await executeTool(name, args);
        const summary = summarizeToolResult(name, result);

        onEvent({
          type: "tool_result",
          message: summary,
          toolName: name,
          iteration: i + 1,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: summary,
        });
      } catch (error) {
        const errMsg = `Tool error: ${error instanceof Error ? error.message : "unknown error"}`;
        onEvent({
          type: "tool_result",
          message: errMsg,
          toolName: name,
          iteration: i + 1,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: errMsg,
        });
      }
    }
  }

  // If we hit max iterations without a final result, ask for one
  onEvent({
    type: "status",
    message: "Compiling final results...",
  });

  const finalResponse = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Time to wrap up. Based on everything you've found, output your final ranked list of companies as the JSON block described in your instructions. No more tool calls.",
      },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  const finalText = finalResponse.choices[0]?.message?.content || "";
  if (finalText) {
    onEvent({ type: "thinking", message: finalText });
  }

  return parseFinalResults(finalText);
}

function parseFinalResults(text: string): ScoredCompany[] {
  try {
    const jsonStr = extractJSON(text);
    const parsed = JSON.parse(jsonStr);

    const companies = parsed.companies || parsed;
    if (!Array.isArray(companies)) return [];

    return companies
      .map(
        (c: {
          name?: string;
          url?: string;
          description?: string;
          score?: number;
          reasoning?: string;
          sources?: string[];
          signals?: Record<string, boolean>;
        }) => {
          const sources = c.sources || ["agent"];
          const sourcesLower = sources.map((s) => s.toLowerCase());
          const rawSignals = c.signals || {};

          // Validate signals against sources actually used for this company.
          // If a signal is true but no supporting source backs it, force false.
          const hiringBackers = ["linkedin", "news", "scrape", "scraper", "scrape_website", "twitter", "x"];
          const fundingBackers = [
            "sec-edgar",
            "sec_edgar",
            "sec",
            "edgar",
            "crunchbase",
            "news",
            "twitter",
          ];
          const githubBackers = ["github"];
          const launchBackers = ["hackernews", "hacker-news", "hn", "yc", "ycombinator", "twitter"];

          const hasAny = (backers: string[]) =>
            sourcesLower.some((s) => backers.some((b) => s.includes(b)));

          const validatedSignals: Record<string, boolean> = {
            hiring: !!rawSignals.hiring && hasAny(hiringBackers),
            github: !!rawSignals.github && hasAny(githubBackers),
            funding: !!rawSignals.funding && hasAny(fundingBackers),
            launches: !!rawSignals.launches && hasAny(launchBackers),
          };

          // Low-evidence reasoning flag: short or no digits.
          let reasoning = c.reasoning || "No reasoning provided.";
          const hasDigit = /\d/.test(reasoning);
          if ((reasoning.length < 30 || !hasDigit) && !reasoning.includes("[low-evidence]")) {
            reasoning = `${reasoning} [low-evidence]`;
          }

          return {
            name: c.name || "Unknown",
            url: c.url || "",
            description: c.description || "",
            source: sources[0] || "agent",
            sourceData: {},
            signals: validatedSignals,
            score: c.score || 50,
            reasoning,
            sources,
          };
        }
      )
      .sort(
        (a: ScoredCompany, b: ScoredCompany) => b.score - a.score
      );
  } catch {
    return [];
  }
}
