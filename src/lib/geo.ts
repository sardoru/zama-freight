// Small geodesy helpers. Coordinates are [lng, lat] (GeoJSON order) unless a
// name says otherwise.
export type LngLat = [number, number];

const R = 6_371_008.8; // mean Earth radius, m
const rad = Math.PI / 180;

/** Great-circle distance in metres. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Cumulative distance (m) at every vertex of a polyline; first entry is 0. */
export function cumulative(path: LngLat[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + haversine(path[i - 1], path[i]));
  return out;
}

export function pathLength(path: LngLat[]): number {
  const c = cumulative(path);
  return c[c.length - 1] ?? 0;
}

/** Initial bearing a→b in degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad);
  const x = Math.cos(a[1] * rad) * Math.sin(b[1] * rad) - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Point and heading at fraction t (0–1) of a polyline, using its cumulative distances. */
export function along(path: LngLat[], cum: number[], t: number): { point: LngLat; heading: number } {
  const total = cum[cum.length - 1] ?? 0;
  if (path.length < 2 || total === 0) return { point: path[0] ?? [0, 0], heading: 0 };
  const d = Math.min(Math.max(t, 0), 1) * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const f = (d - cum[i - 1]) / seg;
  const a = path[i - 1];
  const b = path[i];
  return { point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], heading: bearing(a, b) };
}

/** Chaikin smoothing: rounds hand-traced corners so routes read as roads. */
export function smooth(path: LngLat[], iterations = 2): LngLat[] {
  let pts = path;
  for (let k = 0; k < iterations; k++) {
    if (pts.length < 3) return pts;
    const next: LngLat[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/** Bounding box [minLng, minLat, maxLng, maxLat]. */
export function bbox(points: LngLat[]): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
