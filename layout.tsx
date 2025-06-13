import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Firestarter by Firecrawl - Instant AI Chatbots from Any Website",
  description: "Drop a URL and instantly create a custom AI chatbot with API access. Build knowledge bases from any website in seconds with Firecrawl's advanced web scraping.",
  openGraph: {
    title: "Firestarter - Instant AI Chatbots from Any Website",
    description: "Drop a URL and instantly create a custom AI chatbot with API access. Powered by Firecrawl.",
    url: "/firestarter",
    siteName: "Firecrawl Tools",
    images: [
      {
        url: "/firecrawl-logo-with-fire.png",
        width: 1200,
        height: 630,
        alt: "Firestarter by Firecrawl - Instant Website Chatbots",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Firestarter - Instant AI Chatbots from URLs",
    description: "Create custom AI chatbots from any website in seconds",
    images: ["/firecrawl-logo-with-fire.png"],
    creator: "@firecrawl_dev",
  },
  keywords: ["chatbot", "ai", "web scraping", "firecrawl", "knowledge base", "url to chatbot", "website chatbot"],
};

export default function FirestarterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}