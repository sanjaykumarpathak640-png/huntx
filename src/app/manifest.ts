import type { MetadataRoute } from "next";

/** Lets participants "Add to Home Screen" and open HuntX like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HuntX – Campus Treasure Hunt",
    short_name: "HuntX",
    description: "Photography treasure hunt at IIT Patna",
    start_url: "/hunt",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#03060d",
    theme_color: "#03060d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
