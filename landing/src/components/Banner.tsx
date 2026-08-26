import { CONTENT } from '../data/content';

/** Announcement / pilot banner. */
export function Banner() {
  return (
    <div className="bg-sage text-ink">
      <div className="container-page flex min-h-[44px] items-center justify-center gap-3 py-2 text-center">
        <p className="text-[13px] sm:text-sm">{CONTENT.banner.text}</p>
        <a
          href="#pilot"
          className="shrink-0 rounded-full border border-ink/20 bg-ink px-3 py-1 text-[13px] font-semibold text-paper transition-colors hover:bg-ink/85"
        >
          {CONTENT.banner.cta}
        </a>
      </div>
    </div>
  );
}
