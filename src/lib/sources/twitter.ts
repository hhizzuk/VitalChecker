import { Company } from "../types";

interface TweetAuthor {
  userName?: string;
  name?: string;
  isVerified?: boolean;
  isBlueVerified?: boolean;
  followers?: number;
  followersCount?: number;
  description?: string;
  profileBio?: string;
  url?: string;
  profileUrl?: string;
}

interface Tweet {
  url?: string;
  twitterUrl?: string;
  text?: string;
  fullText?: string;
  full_text?: string;
  createdAt?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  viewCount?: number;
  retweets?: number;
  likes?: number;
  views?: number;
  author?: TweetAuthor;
  username?: string;
  authorName?: string;
  authorHandle?: string;
}

const HIRING_REGEX =
  /\b(hiring|we'?re hiring|join (our|the) team|looking for|open role|now hiring|recruiting|join us|come work|we'?re looking)\b/i;
const LAUNCH_REGEX =
  /\b(launch(ing|ed)?|introduc(ing|e)|just shipped|releas(ing|ed|e)|now live|today we|excited to share|excited to announce|day one|going live)\b/i;
const FUNDING_REGEX =
  /\b(raised|raise|series\s?[a-d]|seed round|pre[\s-]?seed|funding|backed by|led by|just closed|announced.{0,15}round)\b/i;

export async function fetchTwitterCompanies(keywords: string[] = []): Promise<Company[]> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken || apifyToken === "your-apify-token-here") {
    throw new Error("APIFY_API_TOKEN missing — required for Twitter scraper");
  }

  if (keywords.length === 0) return [];

  const baseQuery = keywords.slice(0, 4).join(" ");

  const { ApifyClient } = await import("apify-client");
  const client = new ApifyClient({ token: apifyToken });

  const run = await client.actor("apidojo/tweet-scraper").call(
    {
      searchTerms: [
        `${baseQuery} hiring`,
        `${baseQuery} launching`,
        `${baseQuery} raised`,
      ],
      maxItems: 60,
      sort: "Top",
      tweetLanguage: "en",
      minimumRetweets: 2,
    },
    { timeout: 90 }
  );

  if (run.status !== "SUCCEEDED") {
    throw new Error(`Twitter scraper run did not succeed (status: ${run.status})`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const tweets = items as Tweet[];

  interface Candidate {
    handle: string;
    displayName: string;
    bio: string;
    verified: boolean;
    followers: number;
    profileUrl: string;
    tweets: { text: string; url: string; engagement: number; createdAt: string }[];
    signals: { hiring: boolean; launches: boolean; funding: boolean };
  }
  const candidates = new Map<string, Candidate>();

  for (const t of tweets) {
    const handle = t.author?.userName || t.authorHandle || t.username || "";
    if (!handle) continue;

    const text = t.text || t.fullText || t.full_text || "";
    if (!text) continue;

    const tweetUrl =
      t.url || t.twitterUrl || `https://x.com/${handle}/status/`;
    const retweets = t.retweetCount ?? t.retweets ?? 0;
    const likes = t.likeCount ?? t.likes ?? 0;
    const engagement = retweets + likes;
    const createdAt = t.createdAt || "";

    const key = handle.toLowerCase();
    let cand = candidates.get(key);
    if (!cand) {
      cand = {
        handle,
        displayName: t.author?.name || t.authorName || handle,
        bio: t.author?.description || t.author?.profileBio || "",
        verified: !!(t.author?.isVerified || t.author?.isBlueVerified),
        followers: t.author?.followers ?? t.author?.followersCount ?? 0,
        profileUrl: t.author?.profileUrl || t.author?.url || `https://x.com/${handle}`,
        tweets: [],
        signals: { hiring: false, launches: false, funding: false },
      };
      candidates.set(key, cand);
    }

    cand.tweets.push({ text, url: tweetUrl, engagement, createdAt });
    if (HIRING_REGEX.test(text)) cand.signals.hiring = true;
    if (LAUNCH_REGEX.test(text)) cand.signals.launches = true;
    if (FUNDING_REGEX.test(text)) cand.signals.funding = true;
  }

  const companies: Company[] = [];
  const candList: Candidate[] = Array.from(candidates.values());
  for (const c of candList) {
    const hasAnySignal = c.signals.hiring || c.signals.launches || c.signals.funding;
    if (!hasAnySignal && c.followers < 500) continue;

    c.tweets.sort((a: Candidate["tweets"][number], b: Candidate["tweets"][number]) => b.engagement - a.engagement);
    const totalEngagement = c.tweets.reduce(
      (s: number, t: Candidate["tweets"][number]) => s + t.engagement,
      0
    );
    const top = c.tweets[0];

    companies.push({
      name: c.displayName,
      url: c.profileUrl,
      description: c.bio.slice(0, 240) || top?.text.slice(0, 240) || `@${c.handle} on X`,
      source: "twitter",
      sourceData: {
        handle: c.handle,
        verified: c.verified,
        followers: c.followers,
        tweet_count: c.tweets.length,
        total_engagement: totalEngagement,
        top_tweet_text: top?.text.slice(0, 280),
        top_tweet_url: top?.url,
        top_tweet_engagement: top?.engagement,
        bio: c.bio.slice(0, 240),
      },
      signals: {
        hiring: c.signals.hiring,
        launches: c.signals.launches,
        funding: c.signals.funding,
      },
    });
  }

  companies.sort((a, b) => {
    const ae = (a.sourceData.total_engagement as number) || 0;
    const be = (b.sourceData.total_engagement as number) || 0;
    return be - ae;
  });

  return companies.slice(0, 20);
}
