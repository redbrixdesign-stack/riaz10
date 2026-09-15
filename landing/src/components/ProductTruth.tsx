import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

export function ProductTruth() {
  return (
    <Section id="truth" eyebrow="Product truth" heading={CONTENT.truth.heading} className="bg-white">
      <Reveal delay={50}>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-ink/65">{CONTENT.truth.intro}</p>
      </Reveal>
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {CONTENT.truth.columns.map((column, index) => (
          <Reveal key={column.title} delay={index * 80}>
            <article className={`h-full rounded-[2rem] border p-7 ${index === 0 ? 'border-sage bg-sage/15' : 'border-ink/[0.08] bg-paper'}`}>
              <p className="eyebrow text-ink/45">{column.status}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{column.title}</h3>
              <ul className="mt-6 grid gap-3">
                {column.items.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink/70">
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sage" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
