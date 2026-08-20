import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';
import tripShot from '../assets/shots/trip.png';
import mydayShot from '../assets/shots/myyday.png';
import { DeviceFrame } from './DeviceFrame';

/** Built for one person — dark section with two real Beelo screens. */
export function BuiltForOne() {
  return (
    <Section tone="forest" eyebrow="Built for one person" heading={CONTENT.builtForOne.heading}>
      <div className="mt-10 grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
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
        <Reveal delay={120} className="flex flex-wrap items-center justify-center gap-5">
          <DeviceFrame
            src={tripShot}
            alt="Beelo screen: a live trip being tracked while driving to a visit"
            caption="Mileage, captured as you drive"
          />
          <DeviceFrame
            src={mydayShot}
            alt="Beelo screen: the weekly calendar with today's visits"
            caption="The week, at a glance"
          />
        </Reveal>
      </div>
    </Section>
  );
}
