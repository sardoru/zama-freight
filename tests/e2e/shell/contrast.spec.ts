// Issue #7: axe colour-contrast finds nothing on the landing page and the six app
// screens, in light and dark, at 390 and 1440 px (plus the new content pages).
import { expect, test } from "@playwright/test";
import { APP_SCREENS, axe, DESKTOP, PHONE } from "./helpers";

const PAGES = ["/en", ...APP_SCREENS.map((p) => `/en${p}`), "/fr/confidentialite", "/es/aviso-legal"];

for (const scheme of ["light", "dark"] as const) {
  for (const [width, ctx] of [
    ["390", PHONE],
    ["1440", DESKTOP],
  ] as const) {
    test(`colour contrast · ${scheme} · ${width} px`, async ({ browser }) => {
      test.setTimeout(240_000);
      const context = await browser.newContext({ ...ctx, colorScheme: scheme });
      const failures: string[] = [];
      for (const path of PAGES) {
        const page = await context.newPage();
        await page.goto(path, { waitUntil: "load" });
        await expect(page.locator("main")).toBeVisible();
        // Let the market open and the landing's entrance animation finish.
        await page.waitForTimeout(2500);
        for (const v of await axe(page, ["color-contrast"])) for (const n of v.nodes) failures.push(`${path} ${n.target.join(" ")}: ${n.failureSummary?.split("\n").pop()}`);
        await page.close();
      }
      await context.close();
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
}
