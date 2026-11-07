import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        // AI-training opt-out tokens; they have no user agent, so the vercel.json firewall rule can't block them.
        userAgent: ["Google-Extended", "Applebot-Extended"],
        disallow: "/",
      },
    ],
  };
}
