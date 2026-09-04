import { CONTENT } from '../data/content';

/** Beelo wordmark — inline SVG, no external assets. */
export function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8" fill="none">
        <rect width="32" height="32" rx="9" fill="#0A0A0A" />
        <circle cx="16" cy="16" r="10" fill="#FDB913" />
      </svg>
      <span className="text-xl font-semibold tracking-tight" style={{ color: dark ? '#F5F0E8' : '#0A0A0A' }}>
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
          <a href="#pilot" className="text-paper/80 transition-colors hover:text-paper">Apply for the pilot</a>
          <a href="#partner" className="text-paper/80 transition-colors hover:text-paper">Partner with Beelo</a>
          {CONTENT.footer.linkedinHref && (
            <a href={CONTENT.footer.linkedinHref} className="text-paper/80 transition-colors hover:text-paper" target="_blank" rel="noreferrer">
              {CONTENT.footer.linkedin}
            </a>
          )}
          <a href={CONTENT.footer.privacyHref} className="text-paper/80 transition-colors hover:text-paper">
            {CONTENT.footer.privacy}
          </a>
        </nav>
        <a href={`mailto:${CONTENT.email}`} className="text-sm text-paper/80 transition-colors hover:text-paper">
          {CONTENT.email}
        </a>
      </div>
      <div className="border-t border-white/10 py-5">
        <div className="container-page space-y-1 text-xs leading-relaxed text-paper/45">
          <p>© {new Date().getFullYear()} BEELESTIAL LTD. Beelo is a trading name. {CONTENT.footer.status}</p>
          <p>Registered in England and Wales · Company number 15297106 · Registered office: Apartment 6, 2 Copper Place, Manchester M14 7FZ</p>
        </div>
      </div>
    </footer>
  );
}
