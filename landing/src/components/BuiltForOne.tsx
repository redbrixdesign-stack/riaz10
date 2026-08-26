import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';
import tripShot from '../assets/shots/trip.png';
import mydayShot from '../assets/shots/myyday.png';
import { DeviceFrame } from './DeviceFrame';

/** Built for one person — dark section with two real Beelo screens. */
export function BuiltForOne() {
  return (
    <Section id="why" tone="forest" eyebrow="Built for one person" heading={CONTENT.builtForOne.heading}>
      <div className="mt-10 grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="mb-5 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-paper/60">Designed around one pair of hands</p>
          <p className="max-w-prose text-base leading-relaxed text-paper/85">{CONTENT.builtForOne.body}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {CONTENT.builtForOne.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-paper/90">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-sage" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                {point}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="relative mx-auto min-h-[500px] w-full max-w-xl sm:min-h-[620px]">
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[72%] w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sage/10 blur-3xl" />
          <DeviceFrame
            src={tripShot}
            alt="Beelo screen: a live trip being tracked while driving to a visit"
            caption="Mileage, captured as you drive"
            captionTone="light"
            className="absolute bottom-8 left-[8%] -rotate-[5deg]"
          />
          <DeviceFrame
            src={mydayShot}
            alt="Beelo screen: the weekly calendar with today's visits"
            caption="The week, at a glance"
            captionTone="light"
            className="absolute right-[7%] top-0 rotate-[4deg]"
            primary
          />
        </Reveal>
      </div>
    </Section>
  );
}
