import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';
import founderPortrait from '../assets/founder-muhammad-asif-riaz.jpg';

/** Founder story — restrained, founder-led, with a quote. */
export function Founder() {
  return (
    <Section id="story" eyebrow="Founder story" heading={CONTENT.founder.heading} className="bg-white">
      <div className="mt-10 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-14">
        <Reveal>
          <figure className="relative mx-auto max-w-md lg:mx-0">
            <div aria-hidden="true" className="absolute -bottom-3 -right-3 h-full w-full rounded-3xl bg-sage" />
            <img
              src={founderPortrait}
              alt="Muhammad Asif Riaz, founder of Beelo"
              className="relative aspect-square w-full rounded-3xl border border-ink/10 object-cover shadow-lift"
              loading="lazy"
              width="1024"
              height="1029"
            />
          </figure>
        </Reveal>
        <Reveal delay={100}>
          <div>
            <p className="max-w-prose text-base leading-relaxed text-ink/80">{CONTENT.founder.body}</p>
            <blockquote className="mt-7 rounded-2xl border-l-4 border-sage bg-paper p-6 shadow-soft sm:p-7">
              <p className="text-lg font-medium leading-relaxed text-ink sm:text-xl">“{CONTENT.founder.quote}”</p>
              <footer className="mt-4 text-sm leading-relaxed text-ink/60">— {CONTENT.founderName}</footer>
            </blockquote>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
