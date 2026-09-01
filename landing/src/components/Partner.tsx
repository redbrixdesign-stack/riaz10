import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

/** Partner enquiries — lightweight form. */
export function Partner() {
  return (
    <Section eyebrow="Partners" heading={CONTENT.partner.heading} id="partner" className="bg-white">
      <div className="mt-8 max-w-3xl">
        <Reveal>
          <p className="max-w-prose text-base leading-relaxed text-ink/80">{CONTENT.partner.body}</p>
          <a href={`mailto:${CONTENT.email}?subject=Beelo%20partnership`} className="btn-primary mt-6">
            {CONTENT.partner.cta}
          </a>
        </Reveal>
      </div>
    </Section>
  );
}
