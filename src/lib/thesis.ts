import Groq from "groq-sdk";
import { ThesisCriteria } from "./types";

const KNOWN_SOURCES = [
  "search_yc",
  "search_hackernews",
  "search_github",
  "search_sec_edgar",
  "search_news",
  "search_crunchbase",
  "scrape_website",
] as const;

function getClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Fall back to first {...} block
  const brace = text.match(/\{[\s\S]*\}/);
  return brace ? brace[0].trim() : text.trim();
}

const FEW_SHOT_EXAMPLES = `Examples:

Thesis: "B2B SaaS startups that just raised seed or Series A in the last 90 days"
Output:
{
  "industry": "B2B SaaS",
  "stage": "seed-to-series-a",
  "signals": ["funding", "recent_raise", "hiring"],
  "keywords": ["B2B", "SaaS", "enterprise software"],
  "geography": "any",
  "time_window_days": 90,
  "exclusions": [],
  "funding_stage_target": ["seed", "series-a"],
  "priority_sources": ["search_sec_edgar", "search_news", "search_crunchbase", "search_yc"],
  "raw": "B2B SaaS startups that just raised seed or Series A in the last 90 days"
}

Thesis: "Stealth AI startups founded by ex-OpenAI or ex-DeepMind researchers"
Output:
{
  "industry": "Artificial Intelligence",
  "stage": "stealth",
  "signals": ["founder_pedigree", "hiring", "github_activity"],
  "keywords": ["AI", "ex-OpenAI", "ex-DeepMind", "research", "stealth"],
  "geography": "any",
  "time_window_days": 365,
  "exclusions": ["public companies", "established players"],
  "funding_stage_target": ["pre-seed", "seed"],
  "priority_sources": ["search_news", "search_github", "search_hackernews", "search_yc"],
  "raw": "Stealth AI startups founded by ex-OpenAI or ex-DeepMind researchers"
}

Thesis: "Open-source dev tools with traction, US-based, no enterprise focus"
Output:
{
  "industry": "Developer Tools",
  "stage": "early",
  "signals": ["github_activity", "github_stars", "launches", "community"],
  "keywords": ["open source", "developer tools", "OSS", "CLI", "SDK"],
  "geography": "United States",
  "time_window_days": 180,
  "exclusions": ["enterprise"],
  "funding_stage_target": ["pre-seed", "seed", "series-a"],
  "priority_sources": ["search_github", "search_hackernews", "search_yc", "search_news"],
  "raw": "Open-source dev tools with traction, US-based, no enterprise focus"
}

Thesis: "Climate tech hardware startups in Europe at Series B or later"
Output:
{
  "industry": "Climate Tech",
  "stage": "growth",
  "signals": ["funding", "hiring", "partnerships"],
  "keywords": ["climate", "hardware", "cleantech", "decarbonization"],
  "geography": "Europe",
  "time_window_days": 365,
  "exclusions": ["software-only", "early-stage"],
  "funding_stage_target": ["series-b", "series-c", "growth"],
  "priority_sources": ["search_news", "search_crunchbase", "search_sec_edgar"],
  "raw": "Climate tech hardware startups in Europe at Series B or later"
}`;

function buildPrompt(thesis: string, retry = false): string {
  const tail = retry
    ? `\n\nReturn ONLY valid JSON. No prose, no markdown fences, no commentary. Just the JSON object.`
    : `\n\nReturn JSON only, no markdown fences.`;

  return `You parse startup investment theses into structured criteria for a multi-source discovery agent.

Available data sources:
- search_yc: early-stage startups by sector (best for stage filtering, sector queries)
- search_hackernews: Show HN posts (best for launches, traction signals)
- search_github: trending repos (best for dev tools, OSS, tech-stack queries)
- search_sec_edgar: Form D filings (best for "just raised", funding signals — useless for stealth)
- search_news: Google News (best for funding announcements, recent news)
- search_crunchbase: Crunchbase (best for funding stage, validation)
- scrape_website: enrichment (not a primary search tool)

For priority_sources, return an ORDERED list of 4-6 source tool names that best fit THIS thesis. Skip sources that won't help (e.g. SEC EDGAR for stealth companies, GitHub for non-technical sectors).

${FEW_SHOT_EXAMPLES}

Now parse this thesis:
Thesis: "${thesis}"

Return this exact JSON shape:
{
  "industry": "primary industry/sector",
  "stage": "startup stage label",
  "signals": ["signals to prioritize, e.g. hiring, github_activity, funding, launches"],
  "keywords": ["specific keywords to match against company descriptions"],
  "geography": "region/country or 'any'",
  "time_window_days": 30 | 90 | 180 | 365,
  "exclusions": ["things to filter out"],
  "funding_stage_target": ["pre-seed", "seed", "series-a", ...],
  "priority_sources": ["ordered list of 4-6 source tool names"],
  "raw": "the original thesis"
}${tail}`;
}

async function callGroq(thesis: string, retry: boolean): Promise<string> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: buildPrompt(thesis, retry) }],
    temperature: 0.1,
    max_tokens: 1024,
  });
  return response.choices[0]?.message?.content || "";
}

function validate(parsed: Record<string, unknown>, thesis: string): ThesisCriteria {
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const industry =
    typeof parsed.industry === "string" && parsed.industry.trim()
      ? parsed.industry
      : "technology";
  const stage =
    typeof parsed.stage === "string" && parsed.stage.trim() ? parsed.stage : "any";
  const signals = asStringArray(parsed.signals);
  const keywords = asStringArray(parsed.keywords);

  // Filter priority_sources to known sources only
  const rawSources = asStringArray(parsed.priority_sources);
  const priority_sources = rawSources.filter((s) =>
    (KNOWN_SOURCES as readonly string[]).includes(s)
  );

  const geography =
    typeof parsed.geography === "string" ? parsed.geography : undefined;
  const time_window_days =
    typeof parsed.time_window_days === "number" ? parsed.time_window_days : undefined;
  const exclusions = asStringArray(parsed.exclusions);
  const funding_stage_target = asStringArray(parsed.funding_stage_target);

  return {
    industry,
    stage,
    signals: signals.length ? signals : ["hiring", "github", "funding", "launches"],
    keywords: keywords.length
      ? keywords
      : thesis
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3),
    raw: thesis,
    geography,
    time_window_days,
    exclusions: exclusions.length ? exclusions : undefined,
    funding_stage_target: funding_stage_target.length
      ? funding_stage_target
      : undefined,
    priority_sources: priority_sources.length ? priority_sources : undefined,
  };
}

function defaultCriteria(thesis: string): ThesisCriteria {
  return {
    industry: "technology",
    stage: "any",
    signals: ["hiring", "github", "funding", "launches"],
    keywords: thesis
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3),
    raw: thesis,
    priority_sources: [
      "search_yc",
      "search_hackernews",
      "search_github",
      "search_news",
    ],
  };
}

export async function parseThesis(thesis: string): Promise<ThesisCriteria> {
  // Try once
  try {
    const text = await callGroq(thesis, false);
    const parsed = JSON.parse(extractJSON(text));
    return validate(parsed, thesis);
  } catch {
    // Retry once with stricter instruction
    try {
      const text = await callGroq(thesis, true);
      const parsed = JSON.parse(extractJSON(text));
      return validate(parsed, thesis);
    } catch {
      return defaultCriteria(thesis);
    }
  }
}
