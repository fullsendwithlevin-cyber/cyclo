import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chief of Staff – Persönlicher KI-Assistent",
    short_name: "Chief of Staff",
    start_url: "/",
    display: "standalone",
    background_color: "#16161d",
    theme_color: "#6d4aff",
    lang: "de",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
