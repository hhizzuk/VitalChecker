# Tipoff — Get the tip before everyone else

An agent that finds startups about to break out, based on a user's thesis.

## User Flow

User types what kind of company they're looking for ("AI infra companies hiring senior MLEs," "stealth AI startups founded by ex-OpenAI people," "B2B SaaS that just raised"). Agent investigates startups across multiple sources live, scores them on breakout potential, returns ranked results with reasoning.

## Stack

- Next.js 14 with App Router, TypeScript, Tailwind
- Anthropic API (Claude Sonnet for reasoning, Haiku for fast classification)
- Apify API for scraping
- Server-Sent Events for streaming progress to UI
- In-memory state, no database

## Data Sources

Build as pluggable modules, each returns normalized `Company[]`:

1. **YC directory** — full company list with batch, description, website
2. **Hacker News** — Show HN posts and monthly "Who's Hiring" threads
3. **GitHub** — trending repos and org activity (stars, commits, contributors)
4. **SEC EDGAR** — Form D filings (companies that just filed for fundraising)
5. **News scraping** — Google News queries for funding announcements ("[company] raises Series A")
6. **LinkedIn company pages** — employee count, hiring velocity, recent senior hires

### Normalized Shape

```typescript
{
  name: string;
  url: string;
  description: string;
  source: string;
  sourceData: any;
  signals: {
    hiring?: boolean;
    github?: boolean;
    funding?: boolean;
    launches?: boolean;
  };
}
```

## Agent Loop

1. User submits thesis via `POST /api/investigate`
2. Claude parses thesis into structured criteria (industry, stage, signals to prioritize)
3. Fetch candidates from all 6 sources in parallel via Apify
4. Claude filters and dedupes to top 15 candidates matching criteria
5. For each candidate in parallel: enrich with website scrape, GitHub stats, LinkedIn data, recent news
6. Claude scores each company 0-100 on breakout signal with 2-sentence reasoning citing specific signals
7. Stream results back to UI as they complete, ranked by score

## UI (Single Page, Dark Mode)

- **Hero:** "Tipoff — Get the tip before everyone else"
- **Big text input:** "What kind of company are you looking for?"
- **Activity feed** (terminal-style, monospace) showing the agent's work in real-time:
  - "Scanning YC W25 batch... found 47 candidates"
  - "Cross-referencing with HN Who's Hiring..."
  - "SEC EDGAR: 3 Form D filings in last 30 days match criteria"
  - "Investigating Cerebras: GitHub +2.3k stars last week, 5 senior hires on LinkedIn"
  - "Score: 89 — strong hiring + GitHub momentum"
- **Results section:** cards for each company streaming in as ranked. Each card shows:
  - Company name
  - Source badges (which sources it appeared in)
  - Breakout score (0-100, visualized as a bar)
  - 2-sentence reasoning citing specific signals
  - Links to website, GitHub, LinkedIn

### Style

Dark mode, monospace for activity feed, clean serif or sans for cards. Cards animate in as they're scored.

## Build Order

1. Scaffold Next.js + Tailwind + env setup (Anthropic + Apify keys)
2. Build source modules one at a time, starting with YC (the bounded one)
3. Create `/api/investigate` route returning mock data
4. Wire Claude for thesis parsing + scoring
5. Add real Apify scrapers for each source progressively
6. Add SSE streaming for live updates
7. Build the live activity feed UI
8. Build result cards with animations
9. Polish: copy, edge cases, demo theses
10. Pre-test 2-3 demo theses that always return clean results

## Demo Path Priority

"User types thesis → watches agent investigate live across multiple sources → sees ranked results in 30-45 seconds." Optimize entire build for that path.

## Cuts (drop in this order if time is tight)

1. LinkedIn scraping (most flaky)
2. SEC EDGAR (less visual)
3. News scraping
4. Keep YC + HN + GitHub minimum for the demo
5. Cache all source data once at startup
6. Hardcode fallback companies if any scraper fails

## First Step

Scaffold the Next.js app, set up env vars for Anthropic and Apify, write a hello-world test for both APIs. Confirm both work before building anything else.
# VitalChecker
