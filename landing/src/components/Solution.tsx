import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { DeviceFrame } from './DeviceFrame';
import nextShot from '../assets/shots/next.png';

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

/** Product-led solution story: real app screen surrounded by practical outcomes. */
export function Solution() {
  return (
    <Section eyebrow="Beelo in practice" heading={CONTENT.solution.heading} className="overflow-hidden bg-white">
      <Reveal delay={50}>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink/65">{CONTENT.solution.intro}</p>
      </Reveal>

      <div className="product-story mt-14 grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-10">
        <ul className="grid gap-5">
          {CONTENT.solution.items.slice(0, 2).map((item, i) => (
            <Reveal key={item.title} as="li" delay={i * 80}>
              <div className="feature-callout lg:text-right">
                <span className="feature-icon lg:ml-auto">{Object.values(ICONS)[i]}</span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/65">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={110} className="relative mx-auto py-5">
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[88%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage/18 blur-3xl" />
          <div className="relative rounded-[3rem] border border-ink/5 bg-paper px-8 pb-7 pt-9 shadow-soft sm:px-12">
            <p className="mb-5 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/40">A working day, connected</p>
            <DeviceFrame
              src={nextShot}
              alt="Beelo screen showing the weekly diary, upcoming visits and quick customer actions"
              primary
            />
          </div>
        </Reveal>

        <ul className="grid gap-5">
          {CONTENT.solution.items.slice(2).map((item, i) => (
            <Reveal key={item.title} as="li" delay={(i + 2) * 80}>
              <div className="feature-callout">
                <span className="feature-icon">{Object.values(ICONS)[i + 2]}</span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/65">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>

      <Reveal delay={140}>
        <div className="mt-12 grid gap-4 rounded-[2rem] border border-ink/[0.08] bg-ink p-7 text-paper shadow-lift sm:p-9 lg:grid-cols-[0.75fr_1.25fr] lg:items-center lg:gap-10">
          <h3 className="text-2xl font-semibold leading-tight tracking-tight text-sage">{CONTENT.solution.compatibilityHeading}</h3>
          <p className="text-[15px] leading-relaxed text-paper/72">{CONTENT.solution.compatibilityBody}</p>
        </div>
      </Reveal>
    </Section>
  );
}
