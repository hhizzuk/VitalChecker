import { Company } from "../types";

interface AlgoliaHNHit {
  objectID: string;
  title?: string;
  url?: string;
  author?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
  created_at_i?: number;
  story_text?: string;
  _tags?: string[];
}

const HN_ALGOLIA = "https://hn.algolia.com/api/v1/search";

function extractCompanyName(title: string): string {
  return title
    .replace(/^Show HN:\s*/i, "")
    .replace(/^Launch HN:\s*/i, "")
    .split(/[–\-:|—]/)[0]
    .trim();
}

export async function fetchHNCompanies(keywords: string[] = []): Promise<Company[]> {
  const query = keywords.length > 0 ? keywords.join(" ") : "startup launch";

  // Prefer Show HN / Launch HN posts; fall back to general stories.
  const showUrl = `${HN_ALGOLIA}?query=${encodeURIComponent(query)}&tags=(story,show_hn)&hitsPerPage=30`;
  const res = await fetch(showUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HN Algolia search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { hits?: AlgoliaHNHit[] };
  const hits = data.hits || [];

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const hit of hits) {
    if (!hit.title) continue;
    if (!hit.url) continue;
    if ((hit.points || 0) < 10) continue;

    const name = extractCompanyName(hit.title);
    if (!name || name.length > 60) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const isShowHN = (hit._tags || []).includes("show_hn") || /^show hn:/i.test(hit.title);
    const isLaunchHN = /^launch hn:/i.test(hit.title);

    companies.push({
      name,
      url: hit.url,
      description: hit.title,
      source: "hackernews",
      sourceData: {
        points: hit.points,
        num_comments: hit.num_comments,
        author: hit.author,
        created_at: hit.created_at,
        hn_id: hit.objectID,
        hn_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        type: isLaunchHN ? "launch_hn" : isShowHN ? "show_hn" : "story",
      },
      signals: {
        launches: isShowHN || isLaunchHN,
      },
    });

    if (companies.length >= 15) break;
  }

  return companies;
}
