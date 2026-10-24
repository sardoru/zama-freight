// Issue #1: sheets and the ⋯ menu are modal, keep focus, and give it back.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { axe, DESKTOP, DICTS, PHONE, slowClock } from "./helpers";

const es = DICTS.es;

/** Opens load cards one by one until a sheet with the carrier's bid note appears. */
async function openBidSheet(page: Page): Promise<{ dialog: Locator; note: Locator }> {
  const cards = page.locator("main button[aria-pressed]").filter({ hasText: /ZM-\d+/ });
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    await cards.nth(i).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const note = dialog.getByPlaceholder(es.loads.notePh);
    if (await note.count()) return { dialog, note };
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  throw new Error("no open load with a bid form");
}

/** True when the focused element is `el` or inside it. */
const focusIn = (el: Locator) => el.evaluate((node) => node.contains(document.activeElement));

test.describe("phone, load board as a carrier", () => {
  test.use(PHONE);

  test("a full sentence typed into the bid note arrives intact", async ({ page }) => {
    await page.goto("/es/app/loads?as=carrier");
    await slowClock(page);
    const { dialog, note } = await openBidSheet(page);
    const sentence = "Recogida antes de las 9, el conductor habla euskera y francés y lleva trampilla.";
    await note.click();
    // ~8 s of typing, so the one-second market ticks re-render the sheet many times meanwhile.
    await note.pressSequentially(sentence, { delay: 100 });
    await expect(note).toHaveValue(sentence);
    expect(await note.evaluate((el) => el === document.activeElement)).toBe(true);
    expect(await focusIn(dialog)).toBe(true);
  });

  test("the sheet is a named dialog (axe aria-dialog-name)", async ({ page }) => {
    await page.goto("/es/app/loads?as=carrier");
    const { dialog } = await openBidSheet(page);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    const name = await dialog.evaluate((el) => document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? "");
    expect(name).toMatch(/^ZM-\d+/);
    const violations = await axe(page, ["aria-dialog-name", "aria-hidden-focus", "button-name", "select-name"]);
    expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
  });
});

test.describe("desktop, Dispatch", () => {
  test.use(DESKTOP);

  async function openDispatchSheet(page: Page) {
    await page.goto("/es/app/dispatch?as=dispatcher");
    await slowClock(page);
    // A delivered load: its card stays in the last column, so the opener is still there on close.
    const opener = page.locator("main section").nth(4).locator("article > button").first();
    await expect(opener).toBeVisible();
    await opener.evaluate((el) => el.setAttribute("data-test-opener", ""));
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return { dialog, opener };
  }

  test("focus stays where it is inside the sheet for 10 s and more", async ({ page }) => {
    const { dialog } = await openDispatchSheet(page);
    // The sheet takes focus once, when it opens.
    expect(await dialog.evaluate((el) => el === document.activeElement)).toBe(true);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
    const samples: boolean[] = [];
    const start = Date.now();
    while (Date.now() - start < 10_500) {
      samples.push(await page.evaluate((html) => document.activeElement?.outerHTML.slice(0, 120) === html, focused));
      await page.waitForTimeout(250);
    }
    expect(samples.length).toBeGreaterThan(30);
    expect(samples.every(Boolean)).toBe(true);
    expect(await focusIn(dialog)).toBe(true);
  });

  test("40 presses of Tab (and Shift+Tab) never leave the sheet; Escape returns focus to the opener", async ({ page }) => {
    const { dialog } = await openDispatchSheet(page);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      expect(await focusIn(dialog), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusIn(dialog), `Shift+Tab ${i + 1}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-test-opener"))).toBe(true);
  });

  test("the close button also returns focus to the opener", async ({ page }) => {
    const { dialog } = await openDispatchSheet(page);
    await dialog.getByRole("button", { name: es.common.close }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-test-opener"))).toBe(true);
  });
});

test.describe("phone, map settings sheet", () => {
  test.use(PHONE);

  test("keeps focus for 10 s and traps Tab", async ({ page }) => {
    await page.goto("/es/app?as=dispatcher");
    const button = page.getByRole("button", { name: es.map.panel });
    await expect(button).toBeVisible();
    await button.click();
    const dialog = page.getByRole("dialog", { name: es.map.panel });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
    await page.waitForTimeout(10_500);
    expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))).toBe(focused);
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      expect(await focusIn(dialog), `Tab ${i + 1}`).toBe(true);
    }
  });
});

test.describe("the ⋯ menu", () => {
  for (const [label, ctx] of [
    ["phone", PHONE],
    ["desktop", DESKTOP],
  ] as const) {
    test(`${label}: focus moves in, Tab stays in, Escape returns to ⋯`, async ({ browser }) => {
      const context = await browser.newContext(ctx);
      const page = await context.newPage();
      await page.goto("/es/app/fleet?as=carrier");
      const trigger = page.getByRole("button", { name: es.common.menu });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("dialog", { name: es.common.menu });
      await expect(menu).toBeVisible();
      expect(await focusIn(menu)).toBe(true);
      await expect(menu.getByRole("link", { name: es.privacy.title })).toBeVisible();
      await expect(menu.getByRole("link", { name: es.legal.title })).toBeVisible();
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        expect(await focusIn(menu), `Tab ${i + 1}`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await context.close();
    });
  }
});
