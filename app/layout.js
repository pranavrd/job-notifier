import "./globals.css";

export const metadata = {
  title: "JobNotifier",
  description: "Live tech & AI roles from the last 24 hours, pulled from company job boards and free aggregators.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
