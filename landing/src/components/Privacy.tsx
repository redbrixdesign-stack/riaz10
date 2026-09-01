import { CONTENT } from '../data/content';
import { Reveal } from './Reveal';
import { Section } from './Section';

/** Plain-language pilot privacy and data-handling commitments. */
export function Privacy() {
  return (
    <Section id="privacy" eyebrow="Privacy & data handling" heading={CONTENT.privacy.heading}>
      <Reveal delay={40}>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink/70">{CONTENT.privacy.intro}</p>
      </Reveal>
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {CONTENT.privacy.items.map((item, index) => (
          <Reveal key={item.title} delay={index * 70}>
            <article className="h-full rounded-2xl border border-ink/[0.08] bg-white p-6 shadow-soft">
              <span className="text-xs font-semibold text-ink/35">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink/65">{item.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
      <Reveal delay={180}>
        <p className="mt-7 text-sm text-ink/60">
          Questions about the pilot or your data?{' '}
          <a className="font-semibold text-ink underline decoration-sage decoration-2 underline-offset-4" href={`mailto:${CONTENT.email}`}>
            {CONTENT.email}
          </a>
        </p>
      </Reveal>
    </Section>
  );
}
