"use client";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";

/** Leaflet touches `window`, so it is loaded client-side only. */
export const HuntMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[300px] place-items-center rounded-2xl border border-white/5 bg-ink-900">
      <Spinner />
    </div>
  ),
});
export type { MapMarker, MapCircle, MapDot } from "./leaflet-map";
