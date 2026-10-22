import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Drezzy Stores",
    short_name: "Drezzy",
    description: "Your Outfits Solution. You order, we deliver, you drip.",
    start_url: "/",
    display: "standalone",
    background_color: "#00115b",
    theme_color: "#00115b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
