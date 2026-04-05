import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";
import type { GenderFocus, GrantType } from "@prisma/client";
import { BROWSER_HEADERS, SCRAPER_TIMEOUT_MS } from "./config";
import {
  extractDeadline,
  isExcludedByStateRestriction,
  detectLocationScope,
  isGenericHomepage,
  cleanHtmlToText,
} from "./utils";
import { log, logError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Curated RSS/Atom feed sources for grant announcements
// ---------------------------------------------------------------------------

interface RSSFeedSource {
  url: string;
  sourceName: string;
  grantType: GrantType;
  defaultGender: GenderFocus;
  /** Optional keywords to filter feed items (at least one must match) */
  filterKeywords?: string[];
}

const RSS_FEEDS: RSSFeedSource[] = [
  {
    url: "https://www.sba.gov/rss/news.xml",
    sourceName: "sba-rss",
    grantType: "FEDERAL",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "award", "small business", "program", "opportunity"],
  },
  {
    url: "https://www.grants.gov/rss/GG_NewOppByAgency.xml",
    sourceName: "grants-gov-rss",
    grantType: "FEDERAL",
    defaultGender: "ANY",
    filterKeywords: ["small business", "SBA", "USDA", "Commerce", "minority", "women", "veteran"],
  },
  {
    url: "https://www.rd.usda.gov/rss.xml",
    sourceName: "usda-rss",
    grantType: "FEDERAL",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "business", "rural", "loan", "program"],
  },
  {
    url: "https://helloalice.com/blog/feed/",
    sourceName: "hello-alice-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "apply", "application", "award", "small business"],
  },
  {
    url: "https://www.score.org/feed",
    sourceName: "score-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "small business grant", "award"],
  },
  {
    url: "https://www.iowaeda.com/feed/",
    sourceName: "ieda-rss",
    grantType: "STATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "program", "business", "award", "incentive"],
  },
  {
    url: "https://iowasbdc.org/feed/",
    sourceName: "iowa-sbdc-rss",
    grantType: "STATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "business", "program", "award"],
  },
  {
    url: "https://www.nase.org/rss",
    sourceName: "nase-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "growth grant", "small business"],
  },
  {
    url: "https://www.fundera.com/blog/feed",
    sourceName: "fundera-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "small business grant", "free money", "funding"],
  },
  {
    url: "https://www.nav.com/blog/feed/",
    sourceName: "nav-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "small business grant", "award"],
  },
  {
    url: "https://www.nfib.com/feed/",
    sourceName: "nfib-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "small business", "program", "award"],
  },
  {
    url: "https://www.entrepreneur.com/latest.rss",
    sourceName: "entrepreneur-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "small business grant", "funding", "award", "pitch competition"],
  },
  {
    url: "https://www.inc.com/rss/homepage.xml",
    sourceName: "inc-rss",
    grantType: "PRIVATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "small business grant", "funding", "award"],
  },
  {
    url: "https://www.mbda.gov/rss.xml",
    sourceName: "mbda-rss",
    grantType: "FEDERAL",
    defaultGender: "MINORITY",
    filterKeywords: ["grant", "funding", "opportunity", "program", "business", "award"],
  },
  {
    url: "https://www.eda.gov/rss/news.xml",
    sourceName: "eda-rss",
    grantType: "FEDERAL",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "opportunity", "investment", "award", "business"],
  },
  {
    url: "https://www.nifa.usda.gov/rss/news.xml",
    sourceName: "nifa-rss",
    grantType: "FEDERAL",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "rural", "agriculture", "business", "opportunity"],
  },
  {
    url: "https://www.energy.gov/eere/rss.xml",
    sourceName: "doe-eere-rss",
    grantType: "FEDERAL",
    defaultGender: "ANY",
    filterKeywords: ["grant", "funding", "small business", "sbir", "opportunity", "award"],
  },
  {
    url: "https://iowacapitaldispatch.com/feed/",
    sourceName: "iowa-capital-dispatch-rss",
    grantType: "STATE",
    defaultGender: "ANY",
    filterKeywords: ["grant", "small business", "funding", "program", "iowa", "award"],
  },
  {
    url: "https://wbenc.org/feed/",
    sourceName: "wbenc-rss",
    grantType: "PRIVATE",
    defaultGender: "WOMEN",
    filterKeywords: ["grant", "funding", "opportunity", "award", "women", "business"],
  },
];

// ---------------------------------------------------------------------------
// RSS/Atom XML parsing with cheerio
// ---------------------------------------------------------------------------

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}

function parseRSSFeed(xml: string): FeedItem[] {
  const $ = cheerio.load(xml, { xml: true });
  const items: FeedItem[] = [];

  // Try RSS 2.0 format first
  $("item").each((_, el) => {
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link").first().text().trim();
    const description = $(el).find("description").first().text().trim();
    const pubDate = $(el).find("pubDate").first().text().trim();

    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  });

  // Try Atom format if RSS found nothing
  if (items.length === 0) {
    $("entry").each((_, el) => {
      const title = $(el).find("title").first().text().trim();
      const link =
        $(el).find("link[rel='alternate']").attr("href") ||
        $(el).find("link").first().attr("href") ||
        "";
      const description =
        $(el).find("summary").first().text().trim() || $(el).find("content").first().text().trim();
      const pubDate = $(el).find("published, updated").first().text().trim();

      if (title && link) {
        items.push({ title, link: link.trim(), description, pubDate });
      }
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Feed item filtering
// ---------------------------------------------------------------------------

function isRelevantItem(item: FeedItem, filterKeywords?: string[]): boolean {
  if (!filterKeywords || filterKeywords.length === 0) return true;

  const searchText = `${item.title} ${item.description}`.toLowerCase();
  return filterKeywords.some((kw) => searchText.includes(kw.toLowerCase()));
}

function isRecentItem(item: FeedItem, maxAgeDays: number = 90): boolean {
  if (!item.pubDate) return true; // No date info — include it
  try {
    const pubDate = new Date(item.pubDate);
    const ageDays = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= maxAgeDays;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Scrape a feed item page for grant details
// ---------------------------------------------------------------------------

async function scrapeItemPage(
  url: string,
  feedItem: FeedItem,
  source: RSSFeedSource,
): Promise<GrantData | null> {
  try {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: SCRAPER_TIMEOUT_MS,
      maxRedirects: 3,
    });

    if (response.status !== 200 || typeof response.data !== "string") return null;

    const $ = cheerio.load(response.data);
    $("nav, footer, script, style, header, iframe, noscript, svg, aside").remove();

    const pageText = $("main, article, .content, .entry-content, body")
      .first()
      .text()
      .replaceAll(/\s+/g, " ")
      .trim();

    // Verify this page is about a grant
    const lowerText = pageText.toLowerCase();
    const grantSignals = ["grant", "funding", "award", "application", "eligible", "apply"];
    if (!grantSignals.some((kw) => lowerText.includes(kw))) return null;

    // Skip state-restricted grants
    if (isExcludedByStateRestriction(pageText)) return null;

    const deadline = extractDeadline(response.data);
    const rawHtml = $("main, article, .content, .entry-content, body").first().html() || "";
    const description = cleanHtmlToText(rawHtml, 800) || feedItem.description;

    const locations = detectLocationScope(pageText);
    const isIowaSpecific = locations.includes("Iowa") && !locations.includes("Nationwide");

    const pageTitle = $("h1").first().text().trim() || $("title").text().trim() || feedItem.title;

    return {
      title: pageTitle,
      description,
      sourceUrl: url,
      sourceName: source.sourceName,
      grantType: isIowaSpecific ? "STATE" : source.grantType,
      status: deadline && deadline < new Date() ? "CLOSED" : "OPEN",
      businessStage: "BOTH",
      gender: source.defaultGender,
      locations,
      industries: [],
      deadline,
      categories: ["RSS Discovery"],
      eligibleExpenses: [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scrapeRssFeeds(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  for (const feed of RSS_FEEDS) {
    try {
      const response = await axios.get(feed.url, {
        headers: {
          "User-Agent": BROWSER_HEADERS["User-Agent"],
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
        timeout: SCRAPER_TIMEOUT_MS,
        maxRedirects: 3,
      });

      if (response.status !== 200 || typeof response.data !== "string") {
        log("rss-feeds", `Feed unavailable: ${feed.sourceName}`, { status: response.status });
        continue;
      }

      const items = parseRSSFeed(response.data);
      const relevantItems = items
        .filter((item) => isRelevantItem(item, feed.filterKeywords))
        .filter((item) => isRecentItem(item, 90))
        .filter((item) => !isGenericHomepage(item.link))
        .slice(0, 10); // Cap at 10 items per feed

      log(
        "rss-feeds",
        `${feed.sourceName}: ${items.length} items, ${relevantItems.length} relevant`,
      );

      for (const item of relevantItems) {
        if (seenUrls.has(item.link)) continue;
        seenUrls.add(item.link);

        const grant = await scrapeItemPage(item.link, item, feed);
        if (grant) {
          allGrants.push(grant);
        }

        // Polite delay between page fetches
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (error) {
      logError("rss-feeds", `Failed to fetch feed: ${feed.sourceName}`, error);
    }

    // Delay between feeds
    await new Promise((r) => setTimeout(r, 1000));
  }

  log("rss-feeds", "Total grants from RSS feeds", { count: allGrants.length });
  return allGrants;
}
