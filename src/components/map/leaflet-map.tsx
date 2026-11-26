"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { IIT_PATNA } from "@/lib/geo";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color?: string;
  pulse?: boolean;
  popup?: React.ReactNode;
}
export interface MapCircle {
  id: string;
  lat: number;
  lng: number;
  radius: number;
  color?: string;
  dashed?: boolean;
  popup?: React.ReactNode;
}
export interface MapDot {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  popup?: React.ReactNode;
}

function pinIcon(label: string, color = "#39ff88", pulse = false) {
  const safe = label.replace(/[<>&"]/g, "");
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div style="position:relative;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
      <div style="white-space:nowrap;font:600 11px Manrope,sans-serif;color:#03060d;background:${color};padding:3px 8px;border-radius:999px;box-shadow:0 0 16px ${color}88">${safe}</div>
      <div style="width:2px;height:10px;background:${color}"></div>
      <div style="position:relative;width:10px;height:10px;border-radius:999px;background:${color};box-shadow:0 0 10px ${color}">
        ${pulse ? `<span style="position:absolute;inset:-8px;border-radius:999px;border:2px solid ${color};animation:pulseRing 2.4s ease-out infinite"></span>` : ""}
      </div></div>`,
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 17));
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function LeafletMap({
  markers = [],
  circles = [],
  dots = [],
  center,
  zoom = 16,
  height = 360,
  fit = true,
  onClick,
  className,
}: {
  markers?: MapMarker[];
  circles?: MapCircle[];
  dots?: MapDot[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: number | string;
  fit?: boolean;
  onClick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const pts: [number, number][] = [
    ...markers.map((m) => [m.lat, m.lng] as [number, number]),
    ...circles.map((c) => [c.lat, c.lng] as [number, number]),
  ];
  const c = center ?? (pts[0] ? { lat: pts[0][0], lng: pts[0][1] } : IIT_PATNA);
  return (
    <div className={className} style={{ height }}>
      <MapContainer center={[c.lat, c.lng]} zoom={zoom} style={{ height: "100%", width: "100%", borderRadius: 16 }} scrollWheelZoom>
        <TileLayer
          className="huntx-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {circles.map((ci) => (
          <Circle
            key={ci.id}
            center={[ci.lat, ci.lng]}
            radius={ci.radius}
            pathOptions={{ color: ci.color ?? "#22d3ee", fillOpacity: 0.12, weight: 2, dashArray: ci.dashed ? "6 6" : undefined }}
          >
            {ci.popup && <Popup>{ci.popup}</Popup>}
          </Circle>
        ))}
        {dots.map((d) => (
          <CircleMarker key={d.id} center={[d.lat, d.lng]} radius={5} pathOptions={{ color: d.color ?? "#fbbf24", fillOpacity: 0.9, weight: 1 }}>
            {d.popup && <Popup>{d.popup}</Popup>}
          </CircleMarker>
        ))}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={pinIcon(m.label, m.color, m.pulse)}>
            {m.popup && <Popup>{m.popup}</Popup>}
          </Marker>
        ))}
        {fit && <FitBounds points={pts} />}
        <ClickHandler onClick={onClick} />
      </MapContainer>
    </div>
  );
}
