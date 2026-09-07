import "./globals.css";

export const metadata = {
  title: "JobNotifier",
  description: "Live tech & AI roles from the last 24 hours, pulled from company job boards and free aggregators.",
  // RSS auto-discovery: readers subscribed to the site pick up /api/feed. Add
  // ?role=…&country=…&work=…&window=… to that URL to follow a filtered slice.
  alternates: {
    types: { "application/rss+xml": [{ url: "/api/feed", title: "JobNotifier — live tech & AI roles" }] },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
