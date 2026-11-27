import { db } from "@/lib/db";
import { isSiteSyncEnabled, syncPublishedProductStock } from "@/lib/site-stock-sync";

const MAX_ATTEMPTS = 12;
const POLL_MS = 15_000;
const STALE_LOCK_MS = 2 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

type WorkerState = typeof globalThis & {
  __mbSiteSyncWorkerStarted?: boolean;
  __mbSiteSyncWorkerBusy?: boolean;
};

async function processOne() {
  if (!isSiteSyncEnabled()) return;
  const now = new Date();

  // Recover work abandoned by an abruptly terminated process.
  await db.siteSyncOutbox.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: { status: "PENDING", lockedAt: null, nextAttemptAt: now },
  });

  const item = await db.siteSyncOutbox.findFirst({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
  });
  if (!item) return;

  const claimed = await db.siteSyncOutbox.updateMany({
    where: { id: item.id, status: "PENDING" },
    data: { status: "PROCESSING", lockedAt: now, attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return;

  const attempt = item.attempts + 1;
  try {
    const result = await syncPublishedProductStock(item.productId);
    if (!result.ok) throw new Error(result.error || "Falha na sincronização remota.");
    await db.siteSyncOutbox.updateMany({
      where: { id: item.id, status: "PROCESSING" },
      data: { status: "DONE", lockedAt: null, lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido na sincronização.";
    const terminal = attempt >= MAX_ATTEMPTS;
    const backoff = Math.min(30_000 * (2 ** Math.min(attempt - 1, 10)), MAX_BACKOFF_MS);
    await db.siteSyncOutbox.updateMany({
      where: { id: item.id, status: "PROCESSING" },
      data: {
        status: terminal ? "FAILED" : "PENDING",
        lockedAt: null,
        nextAttemptAt: new Date(Date.now() + backoff),
        lastError: message.slice(0, 2000),
      },
    });
  }
}

export function startSiteSyncWorker() {
  const state = globalThis as WorkerState;
  if (state.__mbSiteSyncWorkerStarted) return;
  state.__mbSiteSyncWorkerStarted = true;

  const tick = async () => {
    if (state.__mbSiteSyncWorkerBusy) return;
    state.__mbSiteSyncWorkerBusy = true;
    try {
      // Drain a small batch per tick without competing with foreground work.
      for (let i = 0; i < 5; i++) {
        await processOne();
      }
    } catch (error) {
      console.error("[site-sync-worker] Falha ao processar fila:", error);
    } finally {
      state.__mbSiteSyncWorkerBusy = false;
    }
  };

  const timer = setInterval(() => { void tick(); }, POLL_MS);
  timer.unref?.();
  void tick();
}
