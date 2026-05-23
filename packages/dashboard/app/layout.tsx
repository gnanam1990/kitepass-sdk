import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KitePass Dashboard",
  description: "Hosted monitoring dashboard for KitePass SDK integrations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <a className="brand" href="/">
              KitePass Dashboard
            </a>
            <nav className="nav" aria-label="Primary">
              <a href="/api/status">Status API</a>
              <a href="https://github.com/gnanam1990/kitepass-sdk" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
