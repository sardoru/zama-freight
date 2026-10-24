// One WebGL2 check for the whole app: the live map (MapLibre and deck.gl) and the
// warehouse twin (three.js r186) both need WebGL2. The answer is cached, and the
// probe's context is released at once, because each probe used to leave a
// throwaway context behind and browsers keep only about 16 alive.
let cached: boolean | undefined;

export function webgl2(): boolean {
  if (cached !== undefined) return cached;
  if (typeof document === "undefined") return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    cached = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}

/** Runs `fn` when the browser is idle (or after `timeout` ms at the latest); returns a cancel function. */
export function whenIdle(fn: () => void, timeout = 1500): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  // Safari has no requestIdleCallback: wait for the next frame to be painted, then a beat.
  let t: ReturnType<typeof setTimeout> | undefined;
  const raf = requestAnimationFrame(() => {
    t = setTimeout(fn, 200);
  });
  return () => {
    cancelAnimationFrame(raf);
    if (t) clearTimeout(t);
  };
}

/**
 * Runs `fn` once the screen has painted and the browser is idle: for the heavy
 * WebGL chunks (MapLibre, three.js), so their download and parse never hold up the
 * first paint of the KPIs and lists. Returns a cancel function.
 */
export function afterPaint(fn: () => void, delay = 300): () => void {
  let cancelIdle: (() => void) | undefined;
  const t = setTimeout(() => {
    cancelIdle = whenIdle(fn);
  }, delay);
  return () => {
    clearTimeout(t);
    cancelIdle?.();
  };
}
