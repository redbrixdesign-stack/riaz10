import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

/** How it works — a simple 4-step sequence. */
export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" heading={CONTENT.how.heading}>
      <ol className="process-line relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CONTENT.how.steps.map((step, i) => (
          <Reveal key={step.title} as="li" delay={i * 90}>
            <div className="relative h-full rounded-2xl border border-ink/8 bg-white p-6 shadow-soft lg:pt-9">
              <span aria-hidden="true" className="absolute right-5 top-5 text-4xl font-semibold tracking-[-0.08em] text-ink/[0.08]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span aria-hidden="true" className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-sage text-sm font-semibold text-ink">{i + 1}</span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{step.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
      <Reveal delay={160}>
        <div className="mt-8 flex flex-col justify-between gap-3 rounded-2xl border border-ink/8 bg-sage/15 px-6 py-5 text-sm sm:flex-row sm:items-center">
          <span className="font-semibold">Beelo holds the context between each step.</span>
          <span className="text-ink/55">Your existing diary and order systems stay in control.</span>
        </div>
      </Reveal>
    </Section>
  );
}
