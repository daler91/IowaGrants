import { createHash } from "node:crypto";
import axios from "axios";
import pLimit from "p-limit";
import { prisma } from "@/lib/db";
import { isSafeUrl } from "@/lib/scrapers/utils";
import {
  CHANGE_DETECTION_TIMEOUT_MS,
  CHANGE_DETECT_CONCURRENCY,
  SCRAPER_USER_AGENT,
} from "@/lib/scrapers/config";
import { log, logError, logWarn } from "@/lib/errors";

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
  const limit = pLimit(CHANGE_DETECT_CONCURRENCY);

  const probeOne = async (monitored: (typeof urls)[number]) => {
    if (!isSafeUrl(monitored.url)) {
      logWarn("change-detection", "Blocked unsafe URL", { url: monitored.url });
      return null;
    }
    try {
      const response = await axios.get(monitored.url, {
        timeout: CHANGE_DETECTION_TIMEOUT_MS,
        headers: { "User-Agent": SCRAPER_USER_AGENT },
        responseType: monitored.url.endsWith(".pdf") ? "arraybuffer" : "text",
      });
      const content =
        typeof response.data === "string"
          ? response.data
          : Buffer.from(response.data).toString("base64");
      const newHash = computeHash(content);
      const hasChanged = monitored.contentHash !== newHash;
      return { monitored, newHash, hasChanged };
    } catch (error) {
      logError("change-detection", `Error checking ${monitored.url}`, error);
      return null;
    }
  };

  const results = await Promise.allSettled(urls.map((m) => limit(() => probeOne(m))));

  const changedUrls: string[] = [];
  const updateOps: ReturnType<typeof prisma.monitoredUrl.update>[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || r.value === null) continue;
    const { monitored, newHash, hasChanged } = r.value;
    updateOps.push(
      prisma.monitoredUrl.update({
        where: { id: monitored.id },
        data: {
          contentHash: newHash,
          lastChecked: new Date(),
          ...(hasChanged ? { lastChanged: new Date(), needsReparse: true } : {}),
        },
      }),
    );
    if (hasChanged) {
      changedUrls.push(monitored.url);
      log("change-detection", "Changed", { url: monitored.url });
    } else {
      log("change-detection", "Unchanged", { url: monitored.url });
    }
  }

  if (updateOps.length > 0) {
    await prisma.$transaction(updateOps);
  }

  log("change-detection", "Check complete", { changed: changedUrls.length, total: urls.length });
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

export async function addMonitoredUrl(url: string, sourceName: string): Promise<void> {
  await prisma.monitoredUrl.upsert({
    where: { url },
    update: { sourceName },
    create: { url, sourceName },
  });
}
