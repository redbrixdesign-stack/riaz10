import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

interface SectionProps {
  id?: string;
  eyebrow?: string;
  heading?: string;
  children: ReactNode;
  /** Light sections use the default paper background. */
  tone?: 'light' | 'forest';
  className?: string;
}

/** Consistent section wrapper: container, optional eyebrow + heading, tone. */
export function Section({ id, eyebrow, heading, children, tone = 'light', className = '' }: SectionProps) {
  const dark = tone === 'forest';
  return (
    <section
      id={id}
      className={`scroll-mt-20 py-20 sm:py-28 ${dark ? 'bg-forest text-paper' : 'bg-paper text-ink'} ${className}`}
    >
      <div className="container-page">
        {(eyebrow || heading) && (
          <Reveal className="max-w-2xl">
            {eyebrow && <p className={`eyebrow mb-3 ${dark ? 'text-sage' : 'text-forest/70'}`}>{eyebrow}</p>}
            {heading && <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{heading}</h2>}
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}
