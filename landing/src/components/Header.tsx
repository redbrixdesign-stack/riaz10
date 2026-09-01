import { CONTENT } from '../data/content';
import { Wordmark } from './Footer';

export function Header() {
  return (
    <nav aria-label="Main navigation" className="site-header border-b border-white/10 text-paper">
      <div className="container-page flex h-[64px] items-center justify-between gap-4 sm:h-[72px] sm:gap-6">
        <a href="#top" aria-label="Beelo home" className="shrink-0">
          <Wordmark dark />
        </a>
        <div className="hidden items-center gap-7 text-sm text-paper/75 md:flex">
          <a href="#how" className="transition-colors hover:text-paper">How it works</a>
          <a href="#why" className="transition-colors hover:text-paper">Why Beelo</a>
          <a href="#story" className="transition-colors hover:text-paper">Founder story</a>
        </div>
        <a href="#pilot" className="btn-primary min-h-[42px] px-5">
          {CONTENT.banner.cta}
        </a>
      </div>
    </nav>
  );
}
