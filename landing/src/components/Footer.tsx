import { CONTENT } from '../data/content';

/** Beelo wordmark — inline SVG, no external assets. */
export function Wordmark({ dark = false }: { dark?: boolean }) {
  const stroke = dark ? '#F7F6F2' : '#153D32';
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7" fill="none">
        <rect x="2" y="2" width="28" height="28" rx="9" stroke={stroke} strokeWidth="2" />
        <circle cx="16" cy="16" r="5" fill={stroke} />
      </svg>
      <span className="text-xl font-semibold tracking-tight" style={{ color: dark ? '#F7F6F2' : '#153D32' }}>
        Beelo
      </span>
    </span>
  );
}

/** Footer — wordmark, tagline, contact, privacy, status. */
export function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="container-page flex flex-col gap-8 py-14 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Wordmark dark />
          <p className="mt-4 text-sm leading-relaxed text-paper/70">{CONTENT.footer.tagline}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-paper/45">{CONTENT.footer.status}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-3 text-sm">
          <a href="#pilot" className="text-paper/80 transition-colors hover:text-paper">Join the pilot</a>
          <a href="#partner" className="text-paper/80 transition-colors hover:text-paper">Partner with Beelo</a>
          <a href={CONTENT.footer.linkedinHref} className="text-paper/80 transition-colors hover:text-paper" target="_blank" rel="noreferrer">
            {CONTENT.footer.linkedin}
          </a>
          <a href={CONTENT.footer.privacyHref} className="text-paper/80 transition-colors hover:text-paper">
            {CONTENT.footer.privacy}
          </a>
        </nav>
        <a href={`mailto:${CONTENT.email}`} className="text-sm text-paper/80 transition-colors hover:text-paper">
          {CONTENT.email}
        </a>
      </div>
      <div className="border-t border-white/10 py-5">
        <p className="container-page text-xs text-paper/45">© {new Date().getFullYear()} Beelo. {CONTENT.footer.status}</p>
      </div>
    </footer>
  );
}
