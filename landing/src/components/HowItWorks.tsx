import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

/** How it works — a simple 4-step sequence. */
export function HowItWorks() {
  return (
    <Section eyebrow="How it works" heading={CONTENT.how.heading}>
      <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CONTENT.how.steps.map((step, i) => (
          <Reveal key={step.title} as="li" delay={i * 90}>
            <div className="relative h-full rounded-2xl border border-ink/8 bg-white p-6 shadow-soft">
              <span aria-hidden="true" className="text-3xl font-semibold text-forest/25">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
