import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

export function ConnectingThread() {
  return (
    <Section id="thread" eyebrow="The connecting layer" heading={CONTENT.thread.heading} className="bg-white">
      <Reveal delay={50}>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-ink/65">{CONTENT.thread.intro}</p>
      </Reveal>
      <Reveal delay={100} className="mt-12">
        <div className="rounded-[2rem] border border-ink/[0.08] bg-paper p-6 shadow-soft sm:p-10">
          <div className="grid gap-4 sm:grid-cols-4">
            {CONTENT.thread.sources.map((item) => (
              <div key={item} className="rounded-2xl border border-ink/10 bg-white px-4 py-4 text-center text-sm font-semibold">{item}</div>
            ))}
          </div>
          <div className="relative my-7 flex items-center justify-center" aria-label="Beelo connects existing working tools">
            <div aria-hidden="true" className="absolute left-4 right-4 h-px bg-sage" />
            <div className="relative z-10 rounded-full bg-ink px-6 py-3 text-center text-sm font-semibold text-sage shadow-lift">
              Beelo <span className="block text-xs font-normal text-paper/65">{CONTENT.thread.centre}</span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            {CONTENT.thread.destinations.map((item) => (
              <div key={item} className="rounded-2xl border border-ink/10 bg-white px-4 py-4 text-center text-sm font-semibold">{item}</div>
            ))}
          </div>
          <p className="mt-7 text-center text-sm font-semibold text-ink/70">{CONTENT.thread.principle}</p>
        </div>
      </Reveal>
    </Section>
  );
}
