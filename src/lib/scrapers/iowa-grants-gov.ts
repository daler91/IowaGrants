import axios from "axios";
import * as cheerio from "cheerio";
import type { GrantData } from "@/lib/types";

const IOWA_GRANTS_URL = "https://www.iowagrants.gov/storefrontFOList.do";

function mapToGrantData(
  title: string,
  url: string,
  description: string,
  deadline?: string
): GrantData {
  return {
    title,
    description,
    sourceUrl: url,
    sourceName: "iowagrants-gov",
    grantType: "STATE",
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: ["Iowa"],
    industries: [],
    deadline: deadline ? new Date(deadline) : undefined,
    categories: [],
    eligibleExpenses: [],
  };
}

export async function scrapeIowaGrantsGov(): Promise<GrantData[]> {
  const allGrants: GrantData[] = [];
  const seenUrls = new Set<string>();

  try {
    const response = await axios.get(IOWA_GRANTS_URL, {
      headers: {
        "User-Agent": "IowaGrantScanner/1.0 (educational research project)",
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // Iowa Grants storefront uses table-based layouts
    $("table tr, .funding-opportunity, main a[href], .content a").each(
      (_, el) => {
        const $el = $(el);

        // Try table row format
        if ("tagName" in el && el.tagName === "tr") {
          const cells = $el.find("td");
          if (cells.length >= 2) {
            const $link = cells.first().find("a");
            const title = $link.text().trim() || cells.first().text().trim();
            const href = $link.attr("href");

            if (!title || title.length < 5 || !href) return;

            const fullUrl = href.startsWith("http")
              ? href
              : `https://www.iowagrants.gov${href}`;

            if (seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);

            // Check for deadline in a later column
            const deadlineText = cells.length >= 3 ? cells.eq(2).text().trim() : undefined;

            allGrants.push(
              mapToGrantData(title, fullUrl, title, deadlineText)
            );
          }
          return;
        }

        // Try link format
        const href = $el.attr("href");
        const title = $el.text().trim();

        if (!href || !title || title.length < 5) return;

        const fullUrl = href.startsWith("http")
          ? href
          : `https://www.iowagrants.gov${href}`;

        if (seenUrls.has(fullUrl)) return;

        const lower = (title + " " + fullUrl).toLowerCase();
        const isRelevant =
          lower.includes("grant") ||
          lower.includes("fund") ||
          lower.includes("program") ||
          lower.includes("opportunity") ||
          lower.includes("application");

        if (!isRelevant) return;

        seenUrls.add(fullUrl);
        const description = $el.parent().text().trim().slice(0, 500) || title;
        allGrants.push(mapToGrantData(title, fullUrl, description));
      }
    );

    console.log(
      `[iowagrants-gov] Scraped ${allGrants.length} opportunities from ${IOWA_GRANTS_URL}`
    );
  } catch (error) {
    console.error(
      `[iowagrants-gov] Error scraping:`,
      error instanceof Error ? error.message : error
    );
  }

  return allGrants;
}
