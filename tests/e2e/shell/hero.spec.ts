// Issue #6: on 360, 375 and 390 px phones, in every language, every element of the
// header and the hero ends at least 16 px inside the right edge, and the page has
// no horizontal overflow, even with `overflow-x-clip` taken off.
import { expect, test } from "@playwright/test";
import { LANGS } from "./helpers";

for (const width of [360, 375, 390]) {
  for (const lang of LANGS) {
    test(`hero fits · ${width} px · ${lang}`, async ({ browser }) => {
      // Not `isMobile`: mobile emulation widens the layout viewport to fit overflowing content,
      // which would hide exactly what this test looks for.
      const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
      const page = await context.newPage();
      await page.goto(`/${lang}`);
      await expect(page.locator("h1")).toBeVisible();
      await page.waitForTimeout(700); // entrance animation
      const result = await page.evaluate(() => {
        document.querySelectorAll(".overflow-x-clip").forEach((el) => el.classList.remove("overflow-x-clip"));
        const limit = window.innerWidth - 16 + 0.5;
        const hero = document.querySelector("main > section");
        const header = document.querySelector("body header");
        const offenders: string[] = [];
        // What a reader sees: text, controls, images and boxes with a background, border or shadow.
        // Plain layout wrappers (their padding is the gutter) and full-bleed bands are not content.
        const visible = (el: Element) => {
          if (Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) return true;
          if (/^(svg|img|canvas|input|select|button|a|textarea)$/i.test(el.tagName)) return true;
          const cs = getComputedStyle(el);
          const bg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
          const border = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0);
          return bg || border || cs.backgroundImage !== "none" || cs.boxShadow !== "none";
        };
        for (const root of [header, hero]) {
          for (const el of root ? Array.from(root.querySelectorAll("*")) : []) {
            // Decorative full-bleed backdrop, and shapes inside an SVG (the SVG box itself is measured).
            if (el.closest("[aria-hidden='true']") || (el instanceof SVGElement && el.ownerSVGElement)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.left <= 0.5 && r.right >= window.innerWidth - 0.5) continue;
            if (!visible(el)) continue;
            if (r.right > limit) offenders.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 40)} ends at ${Math.round(r.right)}`);
          }
        }
        return { offenders, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
      });
      expect(result.innerWidth).toBe(width);
      expect(result.offenders, result.offenders.join("\n")).toEqual([]);
      expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth);
      await context.close();
    });
  }
}
