"use client";
import { useEffect, useState } from "react";

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Wraps navigator.geolocation in a promise with high accuracy. */
export function getPosition(timeout = 20000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation is not supported on this device."));
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      const msg =
        err.code === err.PERMISSION_DENIED
          ? "Location permission denied. Enable it in your browser settings to verify."
          : err.code === err.TIMEOUT
            ? "Could not get a GPS fix in time. Move to open sky and retry."
            : "Location unavailable. Turn on device GPS and retry.";
      reject(new Error(msg));
    }, { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}
