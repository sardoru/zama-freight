// MapLibre GL 6 loads its web worker from a URL next to its own module, which
// a bundler can't follow. Copy the worker into public/ and point MapLibre at it
// (see WORKER_URL in src/components/map/corridor-map.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
const out = join(process.cwd(), "public", "vendor");
mkdirSync(out, { recursive: true });
copyFileSync(join(dist, "dist", "maplibre-gl-worker.mjs"), join(out, "maplibre-gl-worker.mjs"));
console.log("maplibre-gl worker → public/vendor/maplibre-gl-worker.mjs");
