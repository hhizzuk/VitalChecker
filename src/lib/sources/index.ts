import { Company } from "../types";
import { fetchYCCompanies } from "./yc";
import { fetchHNCompanies } from "./hackernews";
import { fetchGitHubCompanies } from "./github";
import { fetchSECEdgarCompanies } from "./sec-edgar";
import { fetchNewsCompanies } from "./news";
import { fetchCrunchbaseCompanies } from "./crunchbase";
import { fetchTwitterCompanies } from "./twitter";
import { scrapeWebsite } from "./scraper";

export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "search_yc",
      description:
        "Search Y Combinator's full company directory. Returns batch, status, team_size, stage, tags, industry, location, and isHiring for early-stage startups.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "Search query (e.g. 'AI infrastructure', 'developer tools', 'fintech')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_hackernews",
      description:
        "Search Hacker News (Show HN, Launch HN, stories) via Algolia. Returns points, num_comments, author, created_at — strong launch/community-traction signal.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "Search query (e.g. 'LLM', 'open source database', 'monitoring')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_github",
      description:
        "Search GitHub for trending, recently-active repos (>500 stars, pushed in last 60 days). Returns stars, forks, watchers, open_issues, language, topics, pushed_at, created_at — strong developer-momentum signal.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "Search query (e.g. 'machine learning framework', 'vector database', 'CLI tool')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_sec_edgar",
      description:
        "Search SEC EDGAR Form D filings (last 90 days). Returns filing_date, form, biz_location, inc_state, industry (SIC), cik, accession — proves recent fundraising activity.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "Search query (e.g. 'artificial intelligence', 'software', 'biotech')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_news",
      description:
        "Search Google News for recent funding announcements. Returns headline, snippet, published date, extracted amount, and round (seed/Series A/etc).",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "Search query (e.g. 'AI startup Series A', 'developer tools funding')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_crunchbase",
      description:
        "Search Crunchbase via Apify. Returns funding_total, last_funding_round, last_funding_date, last_funding_amount, stage, investors, employee_count, founded — definitive funding/stage data.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "Search query (e.g. 'AI startup seed', 'B2B SaaS Series A')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_twitter",
      description:
        "Search X/Twitter via Apify (apidojo/tweet-scraper). Best source for HIRING signals, real-time launches, founder buzz, and engagement-validated traction. Returns handle, verified, followers, top_tweet_text, total_engagement. Auto-detects hiring/launches/funding signals from tweet text.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string" as const,
            description: "Search query (e.g. 'AI infrastructure', 'developer tools', 'fintech'). Will be combined with hiring/launching/raised modifiers automatically.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "scrape_website",
      description:
        "Scrape a company's website to get more details about what they do, their team, product, and traction. Use this to enrich data on promising candidates.",
      parameters: {
        type: "object" as const,
        properties: {
          url: {
            type: "string" as const,
            description: "The full URL to scrape (e.g. 'https://example.com')",
          },
        },
        required: ["url"],
      },
    },
  },
];

export interface ToolResult {
  companies?: Company[];
  text?: string;
  error?: string;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const query = (args.query as string) || "";
  const keywords = query
    .split(/\s+/)
    .filter((w) => w.length > 2);

  try {
    switch (name) {
      case "search_yc":
        return { companies: await fetchYCCompanies(keywords) };
      case "search_hackernews":
        return { companies: await fetchHNCompanies(keywords) };
      case "search_github":
        return { companies: await fetchGitHubCompanies(keywords) };
      case "search_sec_edgar":
        return { companies: await fetchSECEdgarCompanies(keywords) };
      case "search_news":
        return { companies: await fetchNewsCompanies(keywords) };
      case "search_crunchbase":
        return { companies: await fetchCrunchbaseCompanies(keywords) };
      case "search_twitter":
        return { companies: await fetchTwitterCompanies(keywords) };
      case "scrape_website":
        return { text: await scrapeWebsite(args.url as string) };
      default:
        return { text: `Unknown tool: ${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tipoff] tool ${name} failed:`, msg);
    return { error: msg, companies: [] };
  }
}

const RICH_FIELDS = [
  // github
  "stars",
  "forks",
  "pushed_at",
  "created_at",
  "language",
  // hackernews
  "points",
  "num_comments",
  "type",
  // yc
  "batch",
  "status",
  "team_size",
  "stage",
  "isHiring",
  // sec
  "filing_date",
  "form",
  "industry",
  "biz_location",
  // news
  "amount",
  "round",
  "published",
  // crunchbase
  "funding_total",
  "last_funding_date",
  "last_funding_round",
  "last_funding_amount",
  "employee_count",
  "founded_year",
  // twitter
  "handle",
  "verified",
  "followers",
  "tweet_count",
  "total_engagement",
  "top_tweet_engagement",
];

function formatExtra(sourceData: Record<string, unknown> | undefined): string {
  if (!sourceData) return "";
  const parts: string[] = [];
  for (const k of RICH_FIELDS) {
    const v = sourceData[k];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      parts.push(`${k}: ${v.slice(0, 3).join("/")}`);
    } else {
      parts.push(`${k}: ${v}`);
    }
  }
  return parts.join(", ");
}

export function summarizeToolResult(name: string, result: ToolResult): string {
  if (result.error) {
    return `Tool ${name} errored: ${result.error.slice(0, 400)}`;
  }
  if (result.text) {
    return result.text.slice(0, 1500);
  }

  if (!result.companies || result.companies.length === 0) {
    return `No results found from ${name}.`;
  }

  const lines = result.companies.slice(0, 15).map((c) => {
    const signals = Object.entries(c.signals)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ");
    const extra = formatExtra(c.sourceData);
    return `- ${c.name}: ${c.description.slice(0, 120)}${
      signals ? ` [signals: ${signals}]` : ""
    }${extra ? ` (${extra})` : ""}`;
  });

  return `Found ${result.companies.length} companies:\n${lines.join("\n")}`;
}
