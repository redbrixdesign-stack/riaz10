import { CONTENT } from '../data/content';
import { Reveal } from './Reveal';
import { DeviceFrame } from './DeviceFrame';
import homeShot from '../assets/shots/home.png';

/** Hero — headline, sub, CTAs and the real Beelo phone mockups. */
export function Hero() {
  return (
    <header id="top" className="hero-shell relative overflow-hidden bg-forest text-paper">
      <div aria-hidden="true" className="hero-grid" />
      <div aria-hidden="true" className="hero-glow" />
      <div className="container-page relative grid min-h-[690px] gap-14 py-16 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:py-24">
        <div className="relative z-10 max-w-2xl">
          <Reveal>
            <p className="eyebrow mb-4 text-paper/55">{CONTENT.hero.eyebrow}</p>
            <h1 className="max-w-[12ch] text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[4.5rem]">
              The thread connecting <span className="text-sage">your working day.</span>
            </h1>
          </Reveal>
          <Reveal delay={90}>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-paper/72 sm:text-lg">{CONTENT.hero.sub}</p>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#pilot" className="btn-primary-light">
                {CONTENT.hero.ctaPrimary}
              </a>
              <a href="#how" className="btn-ghost-dark">
                {CONTENT.hero.ctaSecondary}
              </a>
            </div>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-paper/65">
              Small, controlled UK pilot · Core capture works offline · Nothing sent without your approval
            </p>
          </Reveal>
        </div>

        <Reveal delay={220} className="product-stage relative mx-auto w-full max-w-[650px] lg:mx-0">
          <div aria-hidden="true" className="product-stage-orbit" />
          <div className="absolute left-0 top-[18%] z-20 hidden rounded-2xl border border-white/10 bg-[#171717]/95 p-4 shadow-2xl backdrop-blur sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-paper/40">Next action</p>
            <p className="mt-2 text-sm font-semibold text-paper">Follow-up, ready when you are</p>
            <p className="mt-1 text-xs text-paper/50">You review. You decide. You send.</p>
          </div>
          <div className="relative z-10 flex justify-center">
            <DeviceFrame
              src={homeShot}
              alt="Beelo screen: today's visits with customer context and parking notes"
              primary
            />
          </div>
          <p className="relative z-20 mt-8 text-center text-xs text-paper/45 sm:mt-3">{CONTENT.hero.mockupNote}</p>
        </Reveal>
      </div>
      <div aria-hidden="true" className="hero-edge" />
    </header>
  );
}
