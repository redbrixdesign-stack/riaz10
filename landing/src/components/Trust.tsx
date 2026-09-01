import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

/**
 * Responsible AI / trust — split "Beelo does / You decide" layout
 * plus the legal-style boundary line.
 */
export function Trust() {
  const list = (items: string[], tone: 'forest' | 'sage') => (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[15px]">
          <span
            aria-hidden="true"
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone === 'forest' ? 'bg-forest' : 'bg-sage'}`}
          />
          {item}
        </li>
      ))}
    </ul>
  );

  return (
    <Section eyebrow="Responsible AI" heading={CONTENT.trust.heading}>
      <Reveal delay={40}>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink/70">{CONTENT.trust.intro}</p>
      </Reveal>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-[2rem] border border-ink/8 bg-white p-7 shadow-soft sm:p-9">
            <span className="text-5xl font-semibold tracking-[-0.08em] text-sage">01</span>
            <h3 className="mt-5 text-xl font-semibold">{CONTENT.trust.doesTitle}</h3>
            <div className="mt-4 text-ink/85">{list(CONTENT.trust.does, 'forest')}</div>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="h-full rounded-[2rem] bg-forest p-7 text-paper shadow-lift sm:p-9">
            <span className="text-5xl font-semibold tracking-[-0.08em] text-sage">02</span>
            <h3 className="mt-5 text-xl font-semibold">{CONTENT.trust.youTitle}</h3>
            <div className="mt-4 text-paper/90">{list(CONTENT.trust.you, 'sage')}</div>
          </div>
        </Reveal>
      </div>
      <Reveal delay={140}>
        <p className="mt-8 max-w-prose text-[13px] leading-relaxed text-ink/55">{CONTENT.trust.legal}</p>
      </Reveal>
    </Section>
  );
}
