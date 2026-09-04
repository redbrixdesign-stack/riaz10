import { CONTENT } from '../data/content';
import { Reveal } from './Reveal';
import { Section } from './Section';

/** Clear PECR information without implying that optional tracking is active. */
export function Cookies() {
  return (
    <Section id="cookies" eyebrow="Cookies & similar technologies" heading={CONTENT.cookies.heading} className="bg-white">
      <Reveal delay={40}>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink/70">{CONTENT.cookies.intro}</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink/45">{CONTENT.cookies.updated}</p>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {CONTENT.cookies.sections.map((item, index) => (
          <Reveal key={item.title} delay={index * 70}>
            <article className="h-full rounded-2xl border border-ink/[0.08] bg-paper p-6 shadow-soft">
              <span className="text-xs font-semibold text-ink/35">{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink/65">{item.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
      <Reveal delay={180}>
        <p className="mt-7 text-sm leading-relaxed text-ink/60">
          Questions about cookies or privacy?{' '}
          <a className="font-semibold text-ink underline decoration-sage decoration-2 underline-offset-4" href={`mailto:${CONTENT.email}`}>
            {CONTENT.email}
          </a>
        </p>
      </Reveal>
    </Section>
  );
}
