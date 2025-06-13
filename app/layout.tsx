import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Firecrawl Tools - AI-Powered Web Scraping & Data Enrichment",
  description: "Transform websites into structured data with Firecrawl's suite of AI tools. Create chatbots, enrich CSVs, search intelligently, and generate images from URLs.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "https://firecrawl.dev"),
  openGraph: {
    title: "Firecrawl Tools - AI-Powered Web Scraping & Data Enrichment",
    description: "Transform websites into structured data with Firecrawl's suite of AI tools. Create chatbots, enrich CSVs, search intelligently, and generate images from URLs.",
    url: "/",
    siteName: "Firecrawl Tools",
    images: [
      {
        url: "/firecrawl-logo-with-fire.png",
        width: 1200,
        height: 630,
        alt: "Firecrawl - AI-Powered Web Scraping",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Firecrawl Tools - AI-Powered Web Scraping",
    description: "Transform websites into structured data with AI",
    images: ["/firecrawl-logo-with-fire.png"],
    creator: "@firecrawl_dev",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning={true}
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <main className="">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
