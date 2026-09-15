import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

export function Routing() {
  const route = CONTENT.routing;
  return (
    <Section id="routing" tone="forest" eyebrow="A better-planned day" heading={route.heading}>
      <div className="mt-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <Reveal>
          <p className="text-base leading-relaxed text-paper/80">{route.intro}</p>
          <p className="mt-5 text-base leading-relaxed text-paper/65">{route.body}</p>
          <p className="mt-6 inline-flex rounded-full border border-sage/30 bg-sage/10 px-4 py-2 text-sm font-semibold text-sage">{route.control}</p>
        </Reveal>
        <Reveal delay={90}>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 p-5">
                <p className="eyebrow text-paper/45">{route.bookedLabel}</p>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-paper">{route.bookedRoute}</p>
              </div>
              <div className="rounded-2xl border border-sage/35 bg-sage/10 p-5">
                <p className="eyebrow text-sage">{route.suggestedLabel}</p>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-sage">{route.suggestedRoute}</p>
              </div>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-paper/45">Illustrative route sequence. Actual recommendations depend on appointment constraints and available route data.</p>
          </div>
        </Reveal>
      </div>

      <Reveal delay={140} className="mt-10">
        <div className="grid gap-8 rounded-[2rem] bg-sage p-7 text-ink shadow-lift sm:p-9 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow text-ink/55">Evidence boundary</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">{route.evidenceTitle}</h3>
            <p className="mt-4 text-[15px] leading-relaxed text-ink/75">{route.evidenceBody}</p>
            <p className="mt-4 text-lg font-semibold leading-snug">{route.scale}</p>
            <p className="mt-4 text-xs leading-relaxed text-ink/60">{route.qualification}</p>
          </div>
          <div className="rounded-2xl bg-ink p-6 text-paper sm:p-8">
            <p className="eyebrow text-sage">Wider impact</p>
            <p className="mt-4 text-base leading-relaxed text-paper/80">{route.impact}</p>
            <p className="mt-6 border-l-2 border-sage pl-4 text-lg font-semibold">A better-planned day is better for the worker, the customer and the road.</p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
