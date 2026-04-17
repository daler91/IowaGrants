import { prisma } from "@/lib/db";
import { log, logError } from "@/lib/errors";

/** Delete AdminInvite rows whose expiry is more than 30 days in the past. */
export async function pruneExpiredInvites(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const { count } = await prisma.adminInvite.deleteMany({
      where: { expiresAt: { lt: cutoff }, usedAt: null },
    });
    if (count > 0) {
      log("retention", "Pruned expired invites", { count, cutoff: cutoff.toISOString() });
    }
    return count;
  } catch (error) {
    logError("retention", "Failed to prune invites", error);
    return 0;
  }
}

/** Entrypoint invoked from the scraper orchestrator after each run. */
export async function runRetentionSweep(): Promise<void> {
  await pruneExpiredInvites();
}
