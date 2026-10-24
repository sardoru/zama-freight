import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { en } from "../../../src/i18n/dictionaries/en";
import { es } from "../../../src/i18n/dictionaries/es";
import { eu } from "../../../src/i18n/dictionaries/eu";
import { fr } from "../../../src/i18n/dictionaries/fr";
import { ru } from "../../../src/i18n/dictionaries/ru";

export const DICTS = { es, eu, fr, en, ru } as const;
export type Lang = keyof typeof DICTS;
export const LANGS = Object.keys(DICTS) as Lang[];

export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const DESKTOP = { viewport: { width: 1440, height: 900 } };

/** The six app screens, each opened in the role that shows most of it. */
export const APP_SCREENS = ["/app?as=dispatcher", "/app/loads?as=carrier", "/app/post?as=shipper", "/app/dispatch?as=dispatcher", "/app/fleet?as=carrier", "/app/warehouse?as=warehouse"];

const AXE_VERSION = "4.14.0";

/** axe-core, fetched once from jsDelivr and cached in the temp directory (it is not a dependency). */
export async function axeSource(): Promise<string> {
  const dir = join(tmpdir(), "zama-e2e");
  const file = join(dir, `axe-core-${AXE_VERSION}.min.js`);
  try {
    return await readFile(file, "utf8");
  } catch {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/axe-core@${AXE_VERSION}/axe.min.js`);
    if (!res.ok) throw new Error(`axe-core download failed: ${res.status}`);
    const src = await res.text();
    await mkdir(dir, { recursive: true });
    await writeFile(file, src);
    return src;
  }
}

export interface AxeNode {
  target: string[];
  html: string;
  failureSummary?: string;
}
export interface AxeViolation {
  id: string;
  nodes: AxeNode[];
}

/** Runs the given axe rules on the page and returns the violations. */
export async function axe(page: Page, rules: string[]): Promise<AxeViolation[]> {
  const loaded = await page.evaluate(() => "axe" in window);
  if (!loaded) await page.addScriptTag({ content: await axeSource() });
  return page.evaluate(async (values) => {
    const w = window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: AxeViolation[] }> } };
    const r = await w.axe.run(document, { runOnly: { type: "rule", values }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 160), failureSummary: n.failureSummary })) }));
  }, rules);
}

/** Slows the simulated clock to ×1 so loads don't change state under a test. */
export async function slowClock(page: Page) {
  for (let i = 0; i < 3; i++) {
    const clock = page.locator("header button[title*='×']").first();
    const title = (await clock.getAttribute("title")) ?? "";
    if (title.endsWith("×1")) return;
    await clock.click();
  }
}
