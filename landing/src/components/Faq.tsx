import { CONTENT } from '../data/content';
import { Reveal } from './Reveal';
import { Section } from './Section';

/** Practical pilot questions for a trade audience, kept compact and jargon-free. */
export function Faq() {
  return (
    <Section id="faq" eyebrow="Before you apply" heading={CONTENT.faq.heading} className="bg-white">
      <Reveal>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink/70">{CONTENT.faq.intro}</p>
      </Reveal>

      <div className="mt-10 grid gap-3 lg:grid-cols-2 lg:items-start">
        {CONTENT.faq.items.map((item, index) => (
          <Reveal key={item.question} delay={(index % 2) * 70}>
            <details className="group rounded-2xl border border-ink/[0.09] bg-paper px-5 py-1 open:shadow-soft sm:px-6">
              <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold leading-snug text-ink marker:content-none">
                <span>{item.question}</span>
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage text-lg font-normal leading-none text-ink transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="border-t border-ink/[0.08] pb-5 pt-4 text-[15px] leading-relaxed text-ink/70">
                {item.answer}
              </p>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
