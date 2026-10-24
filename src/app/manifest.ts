import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zama · Freight & warehouses, Basque coast",
    short_name: "Zama",
    description: "Freight and warehouse marketplace for San Sebastián, Pasaia, Irun and Biarritz–Bayonne.",
    start_url: "/es/app",
    display: "standalone",
    background_color: "#090d12",
    theme_color: "#0c8f81",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
