import { Company } from "../types";

interface EdgarHit {
  _id: string;
  _source: {
    display_names?: string[];
    ciks?: string[];
    file_date?: string;
    form?: string;
    adsh?: string;
    biz_locations?: string[];
    inc_states?: string[];
    sics?: string[];
    file_num?: string[];
    items?: string[];
  };
}

const SIC_INDUSTRY: Record<string, string> = {
  "7370": "Computer Services",
  "7371": "Computer Services - Custom Programming",
  "7372": "Prepackaged Software",
  "7374": "Computer Processing & Data Preparation",
  "7389": "Business Services",
  "2836": "Pharmaceutical Preparations",
  "8731": "Commercial Physical & Biological Research",
  "3674": "Semiconductors",
  "3845": "Electromedical Apparatus",
  "6199": "Finance Services",
  "6770": "Blank Checks",
};

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function cleanCompanyName(raw: string): string {
  // strip "(CIK 0001234567)" and trailing whitespace
  return raw.replace(/\s*\(CIK\s*\d+\)\s*$/i, "").trim();
}

export async function fetchSECEdgarCompanies(keywords: string[] = []): Promise<Company[]> {
  const userAgent = process.env.SEC_USER_AGENT || "tipoff-research/1.0 contact@example.com";
  const headers: Record<string, string> = {
    "User-Agent": userAgent,
    Accept: "application/json",
  };

  // Quote the phrase so multi-word queries return semantic matches.
  const queryRaw = keywords.length > 0 ? keywords.slice(0, 5).join(" ") : "technology";
  const q = `"${queryRaw}"`;
  const startdt = dateDaysAgo(90);
  const enddt = today();

  const url =
    `https://efts.sec.gov/LATEST/search-index` +
    `?q=${encodeURIComponent(q)}` +
    `&forms=D` +
    `&dateRange=custom&startdt=${startdt}&enddt=${enddt}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`SEC EDGAR search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { hits?: { hits?: EdgarHit[] } };
  const hits = data.hits?.hits || [];

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const hit of hits) {
    const src = hit._source || {};
    const rawName = src.display_names?.[0];
    if (!rawName) continue;
    const name = cleanCompanyName(rawName);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const cik = src.ciks?.[0];
    const adsh = src.adsh;
    const filingUrl = cik && adsh
      ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=D&dateb=&owner=include&count=10`
      : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=D&dateb=&owner=include&count=10`;

    const sic = src.sics?.[0];
    const industry = sic ? SIC_INDUSTRY[sic] || `SIC ${sic}` : undefined;

    companies.push({
      name,
      url: filingUrl,
      description: `Filed Form ${src.form || "D"} on ${src.file_date || "?"}${
        src.biz_locations?.[0] ? ` from ${src.biz_locations[0]}` : ""
      }`,
      source: "sec-edgar",
      sourceData: {
        cik,
        accession: adsh,
        filing_date: src.file_date,
        form: src.form,
        biz_location: src.biz_locations?.[0],
        inc_state: src.inc_states?.[0],
        sic,
        industry,
        file_num: src.file_num?.[0],
      },
      signals: {
        funding: true,
      },
    });

    if (companies.length >= 20) break;
  }

  return companies;
}
