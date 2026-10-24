"use client";

// One shared one-second ticker for "what time is it in the market", so every
// clock, ETA and countdown on screen moves together.
import { useSyncExternalStore } from "react";
import { simNow, useMarket } from "./market";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let current = 0;

const read = () => {
  const s = useMarket.getState();
  return s.ready ? simNow(s.clock) : 0;
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      current = read();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Simulated market time (epoch ms), refreshed every real second; 0 before the market opens. */
export function useSimNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => current || (current = read()),
    () => 0,
  );
}

/** Forces the shared clock to re-read (after a reset or a speed change). */
export function refreshSimNow() {
  current = read();
  listeners.forEach((l) => l());
}
