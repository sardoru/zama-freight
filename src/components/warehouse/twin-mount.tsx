"use client";

// Mounts the warehouse twin only once the rest of the screen is up: three.js
// (~250 KB) is fetched after the first paint, when the browser is idle and the
// card is on screen, so the KPIs, the stock list and the dock timeline render
// first. To assistive tech the twin is one image with a label (the lists below
// carry the same data).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { afterPaint } from "@/components/map/webgl";
import { Spinner } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function TwinMount({ label, children }: { label: string; children: ReactNode }) {
  const { d } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [idle, setIdle] = useState(false);
  const [inView, setInView] = useState(false);
  const [mounted, setMounted] = useState(false);
  if (idle && inView && !mounted) setMounted(true);

  useEffect(() => afterPaint(() => setIdle(true)), []);
  useEffect(() => {
    const el = box.current;
    if (!el || mounted) return;
    const io = new IntersectionObserver((entries) => setInView(entries[entries.length - 1].isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  return (
    <div ref={box} role="img" aria-label={label} className="absolute inset-0">
      {mounted ? children : <Spinner label={d.wh.loading3d} className="h-full" />}
    </div>
  );
}
