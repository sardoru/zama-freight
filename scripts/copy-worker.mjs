// MapLibre GL 6 loads its web worker from a URL next to its own module, which
// a bundler can't follow. Copy the worker into public/vendor/ under the package
// version, maplibre-gl-worker-<version>.mjs, and point MapLibre at it (WORKER_URL
// in src/components/map/corridor-map.tsx, which reads the same version from
// maplibre-gl's getVersion()). A new MapLibre gets a new URL, so next.config.ts
// can serve the file as immutable for a year.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkg, "utf8"));
const out = join(process.cwd(), "public", "vendor");
const name = `maplibre-gl-worker-${version}.mjs`;
mkdirSync(out, { recursive: true });
// Drop workers from other versions (and the old unversioned name).
for (const f of readdirSync(out)) if (/^maplibre-gl-worker.*\.mjs$/.test(f) && f !== name) rmSync(join(out, f));
copyFileSync(join(dirname(pkg), "dist", "maplibre-gl-worker.mjs"), join(out, name));
console.log(`maplibre-gl worker → public/vendor/${name}`);
