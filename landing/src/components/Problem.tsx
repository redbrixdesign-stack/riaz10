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
        <div className="overflow-hidden rounded-[2rem] bg-ink text-paper shadow-lift">
          <div className="grid lg:grid-cols-[220px_1fr]">
            <div className="flex items-center gap-5 border-b border-white/10 bg-sage p-7 text-ink lg:block lg:border-b-0 lg:border-r lg:border-black/10 lg:p-9">
              <span className="text-6xl font-semibold tracking-[-0.08em] sm:text-7xl">07</span>
              <p className="max-w-[10rem] text-sm font-semibold leading-snug lg:mt-4">separate places where the working day gets stored</p>
            </div>
            <div className="p-7 sm:p-9">
              <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="The disconnected tools a solo advisor juggles">
                {CONTENT.problem.chain.map((tool, i) => (
                  <li key={tool} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span className="text-[10px] font-semibold text-sage">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-sm font-medium text-paper/80">{tool}</span>
                  </li>
                ))}
                <li className="flex items-center gap-3 rounded-xl border border-sage/35 bg-sage/10 px-4 py-3 sm:col-span-2 xl:col-span-1">
                  <span aria-hidden="true" className="text-sage">→</span>
                  <span className="text-sm font-semibold text-sage">You connect it all</span>
                </li>
              </ol>
              <div className="mt-7 grid gap-4 border-t border-white/10 pt-7 md:grid-cols-[1fr_auto] md:items-end">
                <p className="max-w-2xl text-[15px] leading-relaxed text-paper/62">{CONTENT.problem.supporting}</p>
                <p className="text-sm font-semibold text-paper">{CONTENT.problem.collapse}</p>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
