// README screenshots: `npm run build && npm start`, then `npm run screens`.
// Set BASE to point elsewhere and CHROMIUM_PATH to use a preinstalled Chromium.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/screens";
mkdirSync(OUT, { recursive: true });

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const shots = [
  { name: "landing-dark", path: "/en", ctx: desktop, scheme: "dark" },
  { name: "landing-phone-light", path: "/es", ctx: phone, scheme: "light" },
  { name: "map-dark", path: "/en/app", ctx: desktop, scheme: "dark", wait: 9000 },
  { name: "loads-light", path: "/en/app/loads?id=ZM-4128", ctx: desktop, scheme: "light" },
  { name: "post-phone-dark", path: "/eu/app/post?as=shipper", ctx: phone, scheme: "dark" },
  { name: "dispatch-light", path: "/fr/app/dispatch?as=dispatcher", ctx: desktop, scheme: "light" },
  { name: "warehouse-dark", path: "/en/app/warehouse?w=w-oiartzun&as=warehouse", ctx: desktop, scheme: "dark", wait: 6000 },
  { name: "fleet-phone-light", path: "/ru/app/fleet?as=carrier", ctx: phone, scheme: "light" },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
for (const s of shots) {
  const ctx = await browser.newContext({ ...s.ctx, colorScheme: s.scheme });
  const page = await ctx.newPage();
  await page.goto(BASE + s.path, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(s.wait ?? 3500);
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log(`${OUT}/${s.name}.png`);
  await ctx.close();
}
await browser.close();
