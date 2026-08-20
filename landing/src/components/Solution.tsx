import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

const ICONS = {
  remember: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
    </svg>
  ),
  touch: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11m0-3.5a1.5 1.5 0 0 1 3 0V11m0-2.5a1.5 1.5 0 0 1 3 0V13a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2l-2.2-3a1.5 1.5 0 0 1 2.4-1.8L8 13" />
    </svg>
  ),
  protect: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  ),
  records: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  )
} as const;

/** Solution — four feature blocks. */
export function Solution() {
  return (
    <Section eyebrow="The solution" heading={CONTENT.solution.heading} className="bg-white">
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CONTENT.solution.items.map((item, i) => (
          <Reveal key={item.title} as="li" delay={i * 80}>
            <div className="h-full rounded-2xl border border-ink/8 bg-paper p-6 transition-shadow duration-200 hover:shadow-soft">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sage text-forest">
                {Object.values(ICONS)[i]}
              </span>
              <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
