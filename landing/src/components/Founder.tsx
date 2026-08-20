import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

/** Founder story — restrained, founder-led, with a quote. */
export function Founder() {
  return (
    <Section eyebrow="Founder story" heading={CONTENT.founder.heading} className="bg-white">
      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start">
        <Reveal>
          <p className="max-w-prose text-base leading-relaxed text-ink/80">{CONTENT.founder.body}</p>
        </Reveal>
        <Reveal delay={100}>
          <blockquote className="rounded-2xl border-l-4 border-forest bg-paper p-6 shadow-soft">
            <p className="text-lg font-medium leading-relaxed text-ink">“{CONTENT.founder.quote}”</p>
            <footer className="mt-3 text-sm text-ink/55">— {CONTENT.founderName}</footer>
          </blockquote>
        </Reveal>
      </div>
    </Section>
  );
}
