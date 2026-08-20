import { CONTENT } from '../data/content';

/** Announcement / pilot banner. */
export function Banner() {
  return (
    <div className="bg-forest text-paper">
      <div className="container-page flex min-h-[44px] items-center justify-center gap-3 py-2 text-center">
        <p className="text-[13px] sm:text-sm">{CONTENT.banner.text}</p>
        <a
          href="#pilot"
          className="shrink-0 rounded-full bg-sage px-3 py-1 text-[13px] font-semibold text-forest transition-colors hover:bg-white"
        >
          {CONTENT.banner.cta}
        </a>
      </div>
    </div>
  );
}
