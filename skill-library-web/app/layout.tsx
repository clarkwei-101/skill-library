import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skill Library — 3D bookshelf',
  description:
    'Browse, convert and download agent skills from a 3D bookshelf built with Three.js and GSAP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="site-header__brand">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.4 1-3.9 15-3.3-1z" />
            </svg>
            <span>Skill Library</span>
          </Link>
          <nav className="site-nav">
            <Link href="/">Library</Link>
            <Link href="/upload">Upload</Link>
            <Link href="/search">Search</Link>
          </nav>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
