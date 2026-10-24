// Issue #20: 20 cold loads each of /en, /eu and /en/app/loads, in fresh browser
// contexts, with no console errors. The network is slowed (150 ms latency,
// 200 KB/s) because the hydration error #418 only showed when the page's chunks
// arrived after React had started hydrating; on a fast local network it hid.
import { expect, test } from "@playwright/test";

const LOADS = Number(process.env.COLD_LOADS ?? 20);

for (const path of ["/en", "/eu", "/en/app/loads"]) {
  test(`${LOADS} cold loads of ${path} log no errors`, async ({ browser }) => {
    test.setTimeout(LOADS * 15_000);
    const failures: string[] = [];
    for (let i = 0; i < LOADS; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") failures.push(`#${i} console: ${m.text().slice(0, 200)}`);
      });
      page.on("pageerror", (e) => failures.push(`#${i} pageerror: ${e.message.slice(0, 200)}`));
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 90_000 });
      await page.goto(path, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(1500);
      await context.close();
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
