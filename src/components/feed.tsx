"use client";

import { Activity, Repeat, Route as RouteIcon, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import type { FeedEvent } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useMarket } from "@/store/market";

const FEED_ICON: Record<FeedEvent["kind"], { icon: typeof Truck; tone: string }> = {
  bid: { icon: Activity, tone: "text-accent-text bg-accent-soft" },
  booked: { icon: RouteIcon, tone: "text-blue bg-blue-soft" },
  assigned: { icon: Truck, tone: "text-warn bg-warn-soft" },
  departed: { icon: Truck, tone: "text-signal bg-signal-soft" },
  delivered: { icon: Truck, tone: "text-green bg-green-soft" },
  ecmr: { icon: RouteIcon, tone: "text-blue bg-blue-soft" },
  dock: { icon: WarehouseIcon, tone: "text-violet bg-violet-soft" },
  return: { icon: Repeat, tone: "text-lime bg-lime-soft" },
  posted: { icon: RouteIcon, tone: "text-accent-text bg-accent-soft" },
  alert: { icon: Activity, tone: "text-danger bg-danger-soft" },
  wms: { icon: WarehouseIcon, tone: "text-violet bg-violet-soft" },
};

export function Feed({ onPick, limit = 30, filter }: { onPick?: (loadId: string) => void; limit?: number; filter?: (e: FeedEvent) => boolean }) {
  const { t, f } = useI18n();
  const feed = useMarket((s) => s.feed);
  const items = (filter ? feed.filter(filter) : feed).slice(0, limit);
  return (
    <ol className="min-h-0 flex-1 divide-y divide-line overflow-y-auto scrollbar-thin">
      {items.map((e) => {
        const I = FEED_ICON[e.kind] ?? FEED_ICON.bid;
        const body = (
          <>
            <span className={cn("mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg", I.tone)}>
              <I.icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-[0.78rem] leading-snug text-ink-2">{t(`feed.${e.key}`, e.vars)}</span>
            <span className="tnum shrink-0 font-mono text-[0.68rem] text-ink-3">{f.time(e.at)}</span>
          </>
        );
        return (
          <li key={e.id}>
            {e.loadId && onPick ? (
              <button type="button" onClick={() => onPick(e.loadId!)} className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-surface-2">
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-2.5 px-3 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
