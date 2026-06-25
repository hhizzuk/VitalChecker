import { getApifyClient } from "../apify";

const PERMISSION_HINT =
  "The apify/web-scraper Actor requires you to approve its account permissions once. " +
  "Open https://console.apify.com/actors/moJRLRc85AitArpNN, click Try for free / Run, and accept the permission prompt. " +
  "After that, scrape_website will work for the rest of the session.";

export async function scrapeWebsite(url: string): Promise<string> {
  const client = getApifyClient();
  if (!client) {
    return "Scraper unavailable — set APIFY_API_TOKEN in .env.local and restart `npm run dev`.";
  }

  try {
    const run = await client.actor("apify/web-scraper").call(
      {
        startUrls: [{ url }],
        maxPagesPerCrawl: 1,
        pageFunction: `async function pageFunction(context) {
          const { $, request } = context;
          const title = $('title').text().trim();
          const meta = $('meta[name="description"]').attr('content') || '';
          const ogDesc = $('meta[property="og:description"]').attr('content') || '';
          const headings = [];
          $('h1, h2, h3').each((i, el) => { if (i < 12) headings.push($(el).text().trim()); });
          const paragraphs = [];
          $('p').each((i, el) => { if (i < 20) paragraphs.push($(el).text().trim()); });
          const links = [];
          $('a[href*="careers"], a[href*="jobs"], a[href*="hiring"], a[href*="about"]').each((i, el) => {
            if (i < 8) links.push(($(el).text().trim() + ' -> ' + ($(el).attr('href') || '')).slice(0, 200));
          });
          return {
            url: request.url,
            title,
            meta: meta || ogDesc,
            headings: headings.join(' | '),
            text: paragraphs.join(' ').slice(0, 2500),
            links: links.join(' | '),
          };
        }`,
      },
      { timeout: 90 }
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    const item = items[0] as
      | { title?: string; meta?: string; headings?: string; text?: string; links?: string }
      | undefined;

    if (!item) return "Could not extract content from this page.";

    const parts = [
      item.title && `Title: ${item.title}`,
      item.meta && `Description: ${item.meta}`,
      item.headings && `Sections: ${item.headings}`,
      item.text && `Content: ${item.text.slice(0, 1500)}`,
      item.links && `Notable links: ${item.links}`,
    ].filter(Boolean);

    return parts.join("\n") || "Could not extract meaningful content.";
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    if (/full access|requires.*permission|must approve|requires the Actor/i.test(msg)) {
      return `Scrape failed: ${msg}\n\n${PERMISSION_HINT}`;
    }
    return `Scrape failed: ${msg}`;
  }
}
