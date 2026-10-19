// The built in scheduler. Calls the app's tick once a minute, so follow ups and reminders go out on time
// without any outside service. Each tick runs every step that is due, then this waits for the next minute.
const target = process.env.TICK_URL || "http://app:3000/api/cron/tick";
const secret = process.env.CRON_SECRET || "";
const everyMs = Number(process.env.TICK_EVERY_SECONDS || 60) * 1000;

if (secret.length < 16) {
  console.error("CRON_SECRET must be set (at least 16 characters). The worker cannot start.");
  process.exit(1);
}

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => (stopping = true));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

while (!stopping) {
  const started = Date.now();
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) console.error(`${new Date().toISOString()} tick failed with status ${response.status}`);
    else if (body.ran || body.failed) console.log(`${new Date().toISOString()} tick ran ${body.ran ?? 0}, failed ${body.failed ?? 0}`);
  } catch (error) {
    // The app may be starting or restarting. Try again next minute.
    console.error(`${new Date().toISOString()} tick could not reach the app: ${error instanceof Error ? error.message : error}`);
  }
  const wait = Math.max(1000, everyMs - (Date.now() - started));
  for (let waited = 0; waited < wait && !stopping; waited += 1000) await sleep(1000);
}
