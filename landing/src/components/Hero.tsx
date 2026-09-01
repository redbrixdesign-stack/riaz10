import { CONTENT } from '../data/content';
import { Reveal } from './Reveal';
import { DeviceFrame } from './DeviceFrame';
import homeShot from '../assets/shots/home.png';
import draftShot from '../assets/shots/draft.png';

/** Hero — headline, sub, CTAs and the real Beelo phone mockups. */
export function Hero() {
  return (
    <header id="top" className="hero-shell relative overflow-hidden bg-forest text-paper">
      <div aria-hidden="true" className="hero-grid" />
      <div aria-hidden="true" className="hero-glow" />
      <div className="container-page relative grid min-h-[690px] gap-14 py-16 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:py-24">
        <div className="relative z-10 max-w-2xl">
          <Reveal>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sage/35 bg-sage/10 px-3.5 py-2 text-xs font-semibold text-sage">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sage shadow-[0_0_0_4px_rgba(253,185,19,0.14)]" />
              UK pilot now accepting applications
            </div>
            <p className="eyebrow mb-4 text-paper/55">{CONTENT.hero.eyebrow}</p>
            <h1 className="max-w-[11ch] text-[2.75rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[4.75rem]">
              Your business should not live <span className="text-sage">in your head.</span>
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
            <p className="mt-3 text-xs font-medium text-paper/55">{CONTENT.hero.pilotNote}</p>
            <ul className="mt-8 grid max-w-xl gap-3 text-sm text-paper/72 sm:grid-cols-3">
              {CONTENT.hero.proof.map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage/15 text-sage">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={220} className="product-stage relative mx-auto w-full max-w-[650px] lg:mx-0">
          <div aria-hidden="true" className="product-stage-orbit" />
          <div className="absolute left-0 top-[18%] z-20 hidden rounded-2xl border border-white/10 bg-[#171717]/95 p-4 shadow-2xl backdrop-blur sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-paper/40">Next action</p>
            <p className="mt-2 text-sm font-semibold text-paper">Follow-up, ready when you are</p>
            <p className="mt-1 text-xs text-paper/50">You review. You decide. You send.</p>
          </div>
          <div className="absolute bottom-[14%] right-0 z-20 hidden rounded-2xl border border-sage/25 bg-sage p-4 text-ink shadow-2xl sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/50">Working day</p>
            <p className="mt-2 text-sm font-semibold">Visits, notes and mileage</p>
            <p className="mt-1 text-xs text-ink/60">Connected around the job.</p>
          </div>

          <div className="relative z-10 flex justify-center sm:hidden">
            <DeviceFrame
              src={homeShot}
              alt="Beelo screen: today's visits with customer context, parking notes and offline sync"
              primary
            />
          </div>
          <div className="relative z-10 hidden min-h-[590px] items-end justify-center sm:flex">
            <DeviceFrame
              src={draftShot}
              alt="Beelo screen: a context-aware message draft for a customer"
              className="absolute bottom-12 left-[12%] -rotate-[5deg]"
            />
            <DeviceFrame
              src={homeShot}
              alt="Beelo screen: today's visits with customer context, parking notes and offline sync"
              className="relative z-10 rotate-[2deg]"
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
