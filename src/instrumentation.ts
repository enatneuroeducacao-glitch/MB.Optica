export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSiteSyncWorker } = await import("@/lib/site-stock-worker");
    startSiteSyncWorker();
  }
}
