import { CONTENT } from '../data/content';
import { Reveal } from './Reveal';
import { DeviceFrame } from './DeviceFrame';
import homeShot from '../assets/shots/home.png';
import draftShot from '../assets/shots/draft.png';
import contactShot from '../assets/shots/contact.png';

/** Hero — headline, sub, CTAs and the real Beelo phone mockups. */
export function Hero() {
  return (
    <header className="relative overflow-hidden bg-forest text-paper">
      {/* Subtle sage wash, kept restrained */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-sage/10 blur-3xl"
      />
      <div className="container-page relative grid gap-14 py-16 sm:py-24 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
        <div className="max-w-xl">
          <Reveal>
            <p className="eyebrow mb-4 text-sage">{CONTENT.hero.eyebrow}</p>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {CONTENT.hero.headline}
            </h1>
          </Reveal>
          <Reveal delay={90}>
            <p className="mt-6 text-base leading-relaxed text-paper/85 sm:text-lg">{CONTENT.hero.sub}</p>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#pilot" className="btn-primary-light">
                {CONTENT.hero.ctaPrimary}
              </a>
              <a href="#partner" className="btn-ghost-dark">
                {CONTENT.hero.ctaSecondary}
              </a>
            </div>
          </Reveal>
        </div>

        {/* Product mockup: real Beelo screens in CSS phone frames */}
        <Reveal delay={220} className="relative mx-auto w-full lg:mx-0">
          {/* Mobile: a single phone (the trio would overflow 390px) */}
          <div className="flex justify-center sm:hidden">
            <DeviceFrame
              src={homeShot}
              alt="Beelo screen: today's visits with customer context, parking notes and offline sync"
              caption="Your day, with the context you need"
              primary
            />
          </div>
          {/* Desktop/tablet: three phones */}
          <div className="hidden items-end justify-center gap-4 sm:flex">
            <DeviceFrame
              src={draftShot}
              alt="Beelo screen: a context-aware message draft for a customer"
              caption="A draft, ready for your approval"
              className="translate-y-6"
            />
            <DeviceFrame
              src={homeShot}
              alt="Beelo screen: today's visits with customer context, parking notes and offline sync"
              caption="Your day, with the context you need"
              primary
            />
            <DeviceFrame
              src={contactShot}
              alt="Beelo screen: customer contact sheet with WhatsApp, call and copy number"
              caption="The customer, one tap away"
              className="translate-y-10"
            />
          </div>
          <p className="mt-10 text-center text-xs text-paper/60">{CONTENT.hero.mockupNote}</p>
        </Reveal>
      </div>
    </header>
  );
}
