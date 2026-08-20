import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';

/**
 * Problem: the disconnected-apps flow collapsing into "You remember
 * everything". Built with pure CSS/SVG chips — no imagery needed.
 */
export function Problem() {
  return (
    <Section eyebrow="The problem" heading={CONTENT.problem.heading}>
      <Reveal className="mt-10">
        <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-soft sm:p-8">
          <ol className="flex flex-wrap items-center gap-2" aria-label="The disconnected tools a solo advisor juggles">
            {CONTENT.problem.chain.map((tool, i) => (
              <li key={tool} className="flex items-center gap-2">
                <span className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 text-[13px] font-medium text-ink/80">
                  {tool}
                </span>
                {i < CONTENT.problem.chain.length - 1 && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-3 w-3 text-ink/30"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  >
                    <path d="M3 8h10m0 0-3-3m3 3-3 3" />
                  </svg>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-5 flex items-center gap-3">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-6 w-6 text-ink/40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M5 8v6m4-6v6m4-6v6M3 15h14" />
            </svg>
            <span className="text-sm font-semibold text-ink/70">{CONTENT.problem.collapse}</span>
          </div>
          <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-ink/75">{CONTENT.problem.supporting}</p>
        </div>
      </Reveal>
    </Section>
  );
}
