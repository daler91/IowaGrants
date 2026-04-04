import { createHash } from "node:crypto";
import axios from "axios";
import { prisma } from "@/lib/db";
import { isSafeUrl } from "@/lib/scrapers/utils";
import { CHANGE_DETECTION_TIMEOUT_MS, SCRAPER_USER_AGENT } from "@/lib/scrapers/config";

function computeHash(content: string): string {
  // Strip dynamic elements (timestamps, session tokens) before hashing
  const cleaned = content
    .replaceAll(/\d{1,2}\/\d{1,2}\/\d{4}/g, "") // dates
    .replaceAll(/\d{10,13}/g, "") // unix timestamps
    .replaceAll(/csrf[^"']*["'][^"']*["']/gi, "") // CSRF tokens
    .replaceAll(/\s+/g, " ") // normalize whitespace
    .trim();

  return createHash("sha256").update(cleaned).digest("hex");
}

export async function checkForChanges(): Promise<string[]> {
  const urls = await prisma.monitoredUrl.findMany();
  const changedUrls: string[] = [];
  const updateOps: ReturnType<typeof prisma.monitoredUrl.update>[] = [];

  for (const monitored of urls) {
    try {
      // SSRF protection: skip internal/private URLs
      if (!isSafeUrl(monitored.url)) {
        console.warn(`[change-detection] Blocked unsafe URL: ${monitored.url}`);
        continue;
      }

      const response = await axios.get(monitored.url, {
        timeout: CHANGE_DETECTION_TIMEOUT_MS,
        headers: {
          "User-Agent": SCRAPER_USER_AGENT,
        },
        // For PDFs, get binary data
        responseType: monitored.url.endsWith(".pdf")
          ? "arraybuffer"
          : "text",
      });

      const content =
        typeof response.data === "string"
          ? response.data
          : Buffer.from(response.data).toString("base64");

      const newHash = computeHash(content);
      const hasChanged = monitored.contentHash !== newHash;

      // Collect update operations for batching
      updateOps.push(
        prisma.monitoredUrl.update({
          where: { id: monitored.id },
          data: {
            contentHash: newHash,
            lastChecked: new Date(),
            ...(hasChanged
              ? { lastChanged: new Date(), needsReparse: true }
              : {}),
          },
        })
      );

      if (hasChanged) {
        changedUrls.push(monitored.url);
        console.log(`[change-detection] Changed: ${monitored.url}`);
      } else {
        console.log(`[change-detection] Unchanged: ${monitored.url}`);
      }
    } catch (error) {
      console.error(
        `[change-detection] Error checking ${monitored.url}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Batch all DB updates in a single transaction
  if (updateOps.length > 0) {
    await prisma.$transaction(updateOps);
  }

  console.log(
    `[change-detection] ${changedUrls.length} of ${urls.length} URLs changed`
  );
  return changedUrls;
}

export async function getUrlsNeedingReparse(): Promise<string[]> {
  const urls = await prisma.monitoredUrl.findMany({
    where: { needsReparse: true },
  });
  return urls.map((u) => u.url);
}

export async function markReparsed(url: string): Promise<void> {
  await prisma.monitoredUrl.update({
    where: { url },
    data: { needsReparse: false },
  });
}

export async function addMonitoredUrl(
  url: string,
  sourceName: string
): Promise<void> {
  await prisma.monitoredUrl.upsert({
    where: { url },
    update: { sourceName },
    create: { url, sourceName },
  });
}
