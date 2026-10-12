import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: { default: "Maintenance intake triage", template: "%s | Maintenance intake triage" },
  description: "Claude reads a tenant's maintenance request, a deterministic gate decides, ServiceNow gets the incident.",
  openGraph: {
    title: "Maintenance intake triage",
    description: "Claude structured outputs, a code-owned gate, idempotent ServiceNow incidents, eval-gated autopilot. Built by Mike Olson.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Spline+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 text-sm text-ink-soft border-t border-line">
          Built by Mike Olson, Surfstung Systems. Claude structured outputs, a code-owned gate, ServiceNow Table API.
        </footer>
      </body>
    </html>
  );
}
