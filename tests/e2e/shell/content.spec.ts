// Issues #3 (simulation notice, llms.txt), #5 (error page), #15 (privacy and legal
// pages) and the shell's part of #16 (control names).
import { expect, test } from "@playwright/test";
import { DOC_SLUGS } from "../../../src/lib/doc-routes";
import { APP_SCREENS, DESKTOP, DICTS, LANGS, PHONE } from "./helpers";

test.describe("simulation notice", () => {
  for (const [label, ctx] of [
    ["390 px", PHONE],
    ["1440 px", DESKTOP],
  ] as const) {
    test(`every app screen shows the demo chip above the fold · ${label}`, async ({ browser }) => {
      const context = await browser.newContext(ctx);
      const page = await context.newPage();
      for (const lang of ["es", "ru"] as const) {
        for (const screen of APP_SCREENS) {
          await page.goto(`/${lang}${screen}`);
          const chip = page.locator("header").getByText(DICTS[lang].common.demoData, { exact: true });
          await expect(chip).toBeVisible();
          const box = await chip.boundingBox();
          expect(box && box.y + box.height <= ctx.viewport.height && box.x + box.width <= ctx.viewport.width, `${lang}${screen}`).toBe(true);
        }
      }
      await context.close();
    });
  }

  for (const lang of LANGS) {
    test(`title, description and share text say "prototype" · ${lang}`, async ({ page }) => {
      const d = DICTS[lang];
      await page.goto(`/${lang}`);
      await expect(page).toHaveTitle(d.meta.title);
      expect(d.meta.title).toContain(d.meta.siteName);
      const meta = (sel: string) => page.locator(sel).first().getAttribute("content");
      expect(await meta('meta[name="description"]')).toBe(d.meta.description);
      expect(await meta('meta[property="og:title"]')).toBe(`${d.meta.ogTitle} · ${d.meta.siteName}`);
      expect(await meta('meta[property="og:description"]')).toBe(d.meta.description);
      expect(await meta('meta[name="twitter:title"]')).toBe(`${d.meta.ogTitle} · ${d.meta.siteName}`);
      expect(await meta('meta[property="og:image:alt"]')).toMatch(/prototype/i);
      // App screens carry it in the title template.
      await page.goto(`/${lang}/app/loads`);
      await expect(page).toHaveTitle(`${d.nav.loads} · ${d.meta.siteName}`);
      // The share card renders for every language.
      const card = await page.request.get(`/${lang}/opengraph-image`);
      expect(card.status()).toBe(200);
      expect(card.headers()["content-type"]).toBe("image/png");
    });
  }

  test("the landing band is about the demo, not traction", async ({ page }) => {
    const L = DICTS.en.landing;
    await page.goto("/en");
    const band = page.locator("section[aria-labelledby='demo-stats']");
    await expect(band.getByRole("heading", { name: L.statsTitle })).toBeVisible();
    await expect(band).toContainText(L.statPlaces);
    await expect(band).toContainText(L.statCarriers);
    await expect(band).toContainText(L.statReturn);
    await expect(band).toContainText("−30 %");
    await expect(page.locator("main")).toContainText(L.mapCredit);
  });

  test("/llms.txt explains the simulation, the roles and the corrected rules", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
    const text = await res.text();
    for (const needle of [
      "non-commercial prototype",
      "It is a simulation",
      "Shipper:",
      "Carrier:",
      "Dispatcher:",
      "Warehouse:",
      "0, ECO, C and B labels may enter; vehicles without a label are banned",
      "phase 2",
      "DeCA is mandatory for domestic road freight from 5 October 2026",
      "CMR consignment note, on paper or as an e-CMR. The e-CMR is optional",
      "Inside France: a lettre de voiture",
      "counted per vehicle",
      "at most 3 cabotage operations within 7 days",
      "4-day cooling-off",
    ])
      expect(text, needle).toContain(needle);
    for (const lang of LANGS) expect(text).toMatch(new RegExp(`\\]\\(https?://[^)]+/${lang}\\)`));
  });
});

test.describe("privacy and legal pages", () => {
  for (const lang of LANGS) {
    test(`both pages exist and are linked from the footer and the ⋯ menu · ${lang}`, async ({ page }) => {
      const d = DICTS[lang];
      const privacy = `/${lang}/${DOC_SLUGS[lang].privacy}`;
      const legal = `/${lang}/${DOC_SLUGS[lang].legal}`;

      await page.goto(privacy);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(d.privacy.title);
      for (const host of ["tiles.openfreemap.org", "elevation-tiles-prod", "us-east-1", "zama-demo-v1", "zama-theme", "zama-lang"]) await expect(page.locator("main")).toContainText(host);
      await expect(page.locator("main")).toContainText("Cloudflare");
      await expect(page.locator("main")).toContainText("Vercel");

      await page.goto(legal);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(d.legal.title);
      await expect(page.locator("main")).toContainText(d.legal.operatorPlaceholder);
      await expect(page.locator("main a[href='https://github.com/sardoru/zama-freight/issues']")).toBeVisible();
      expect(await page.locator("main").textContent()).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i); // no email address

      await page.goto(`/${lang}`);
      const footer = page.locator("footer");
      await expect(footer.getByRole("link", { name: d.privacy.title })).toHaveAttribute("href", privacy);
      await expect(footer.getByRole("link", { name: d.legal.title })).toHaveAttribute("href", legal);

      await page.goto(`/${lang}/app/fleet`);
      await page.getByRole("button", { name: d.common.menu }).click();
      const menu = page.getByRole("dialog", { name: d.common.menu });
      await expect(menu.getByRole("link", { name: d.privacy.title })).toHaveAttribute("href", privacy);
      await expect(menu.getByRole("link", { name: d.legal.title })).toHaveAttribute("href", legal);
    });
  }

  test("the language switcher maps the localized slugs", async ({ page }) => {
    await page.goto("/es/privacidad");
    await page.locator("header select").first().selectOption("fr");
    await expect(page).toHaveURL(/\/fr\/confidentialite$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(DICTS.fr.privacy.title);
  });

  test("other slugs are still a localized 404", async ({ request, page }) => {
    expect((await request.get("/eu/privacidad")).status()).toBe(404);
    expect((await request.get("/es/foo")).status()).toBe(404);
    await page.goto("/es/foo");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(DICTS.es.notFound.title);
  });
});

test.describe("error page", () => {
  test("a bad saved state never takes the shell down, and Reset demo recovers", async ({ browser }) => {
    const context = await browser.newContext(DESKTOP);
    // One saved load with a place that doesn't exist (the audit's crash).
    const bad = JSON.stringify({
      v: 1,
      role: "carrier",
      settings: { layers: {}, terrain: false, time: "live" },
      loads: [{ id: "ZM-5990", shipperId: "s-1", from: "atlantis", to: "irun", goods: "pallets", pallets: 2, kg: 800, vehicle: "van", pickupAt: 0, deliverBy: 0, mode: "bids", target: 100, status: "open", ecmr: "none", createdAt: 0, mine: true }],
      bids: [],
      returns: [],
      docks: [],
      binPatches: {},
    });
    await context.addInitScript((value) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("zama-demo-v1", value);
      }
    }, bad);
    const page = await context.newPage();
    const es = DICTS.es;
    await page.goto("/es/app/loads");
    // The shell is always there.
    await expect(page.locator("header").getByText(es.common.demoData)).toBeVisible();
    const alert = page.getByRole("alert").filter({ hasText: es.errorPage.title });
    const board = page.getByRole("heading", { level: 1, name: es.loads.title });
    await expect(alert.or(board)).toBeVisible();
    if (await alert.isVisible()) {
      // Our fallback, translated, with both ways out.
      await expect(alert.getByRole("button", { name: es.errorPage.retry })).toBeVisible();
      await alert.getByRole("button", { name: es.common.reset }).click();
      await expect(board).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("zama-demo-v1") ?? "")).not.toContain("atlantis");
    }
    // Otherwise the store already rejected the bad record (issue #5, store side).
    await context.close();
  });
});

test.describe("control names (#16, shell part)", () => {
  test.use(DESKTOP);

  test("sort, assign, clock and toast close are named in the page's language", async ({ page }) => {
    const fr = DICTS.fr;
    await page.goto("/fr/app/loads?as=carrier");
    await expect(page.getByRole("combobox", { name: fr.loads.sort })).toBeVisible();

    // Read both at once: the market clock ticks every second.
    const [visible, name] = await page
      .locator("header button[title*='×']")
      .first()
      .evaluate((el) => [(el as HTMLElement).innerText.replace(/\s+/g, " ").trim(), el.getAttribute("aria-label") ?? ""]);
    expect(name.startsWith(visible), `"${name}" starts with "${visible}"`).toBe(true);

    await page.goto("/fr/app/dispatch?as=dispatcher");
    const assign = page.getByRole("button", { name: new RegExp(`^${fr.loads.assign} · ZM-\\d+$`) }).first();
    if (await assign.count()) {
      await assign.click();
      const toast = page.locator("[aria-live='polite'] button");
      await expect(toast.first()).toHaveAttribute("aria-label", fr.common.close);
    }
  });
});
