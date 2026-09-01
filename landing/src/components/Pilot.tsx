import { useRef, useState, type FormEvent } from 'react';
import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { validatePilot, submitForm, type PilotFormData } from '../lib/forms';

const EMPTY: PilotFormData = {
  name: '',
  email: '',
  phone: '',
  trade: '',
  area: '',
  ukResident: false,
  worksAlone: 'yes',
  currentTools: '',
  biggestProblem: '',
  partnerInterest: false
};

type Status = 'idle' | 'sending' | 'success' | 'error' | 'uk-only';

/** Pilot application form. */
export function Pilot() {
  const formOpenedAt = useRef(Date.now());
  const [data, setData] = useState<PilotFormData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');

  const set = <K extends keyof PilotFormData>(key: K, value: PilotFormData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const website = String(new FormData(e.currentTarget as HTMLFormElement).get('website') || '');
    const errs = validatePilot(data);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStatus('sending');
    try {
      const { ok, code } = await submitForm({
        type: 'pilot',
        website,
        formElapsedMs: Date.now() - formOpenedAt.current,
        ...data
      });
      setStatus(ok ? 'success' : code === 'uk_only' ? 'uk-only' : 'error');
      if (ok) setData(EMPTY);
    } catch {
      setStatus('error');
    }
  };

  const err = (k: keyof PilotFormData) =>
    errors[k] ? <p className="mt-1 text-[13px] font-medium text-[#B3422E]">{errors[k]}</p> : null;

  return (
    <Section tone="forest" eyebrow="Pilot" heading={CONTENT.pilot.heading} id="pilot">
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <Reveal>
          <p className="max-w-prose text-base leading-relaxed text-paper/85">{CONTENT.pilot.body}</p>
          <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-sage">{CONTENT.pilot.criteriaTitle}</h3>
          <ul className="mt-4 space-y-2.5">
            {CONTENT.pilot.criteria.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-[15px] text-paper/90">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1 h-4 w-4 shrink-0 text-sage" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                {c}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div className="rounded-2xl border border-white/10 bg-white p-6 text-ink shadow-lift sm:p-8">
            {status === 'success' ? (
              <div role="status" className="py-10 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 text-forest" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4 10-10" />
                  </svg>
                </span>
                <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-ink/80">{CONTENT.pilot.success}</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate aria-label="Pilot application form">
                <p className="mb-5 rounded-lg border border-gold/35 bg-gold/10 px-4 py-3 text-[13px] font-medium leading-relaxed text-forest">
                  UK pilot only — applications are currently open to people who live and work in the United Kingdom.
                </p>
                <div className="sr-only" aria-hidden="true">
                  <label htmlFor="p-website">Website</label>
                  <input id="p-website" name="website" tabIndex={-1} autoComplete="off" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="p-name" className="field-label">Name *</label>
                    <input id="p-name" className="field" value={data.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
                    {err('name')}
                  </div>
                  <div>
                    <label htmlFor="p-email" className="field-label">Email *</label>
                    <input id="p-email" type="email" className="field" value={data.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
                    {err('email')}
                  </div>
                  <div>
                    <label htmlFor="p-phone" className="field-label">Phone <span className="text-ink/45">(optional)</span></label>
                    <input id="p-phone" type="tel" className="field" value={data.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
                    {err('phone')}
                  </div>
                  <div>
                    <label htmlFor="p-trade" className="field-label">Trade / role *</label>
                    <input id="p-trade" className="field" placeholder="e.g. window coverings advisor" value={data.trade} onChange={(e) => set('trade', e.target.value)} />
                    {err('trade')}
                  </div>
                  <div>
                    <label htmlFor="p-area" className="field-label">UK postcode *</label>
                    <input id="p-area" className="field" placeholder="e.g. SK1 1AA" value={data.area} onChange={(e) => set('area', e.target.value)} autoComplete="postal-code" />
                    {err('area')}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex items-start gap-2.5 text-sm font-medium text-ink/80">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[#153D32]"
                        checked={data.ukResident}
                        onChange={(e) => set('ukResident', e.target.checked)}
                      />
                      I confirm that I currently live and work in the United Kingdom. *
                    </label>
                    {err('ukResident')}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="field-label">Do you usually work alone?</span>
                    <div className="flex flex-wrap gap-2">
                      {(['yes', 'sometimes', 'no'] as const).map((v) => (
                        <label key={v} className="cursor-pointer">
                          <input
                            type="radio"
                            name="works-alone"
                            className="peer sr-only"
                            checked={data.worksAlone === v}
                            onChange={() => set('worksAlone', v)}
                          />
                          <span className="inline-block rounded-full border border-ink/15 px-3.5 py-1.5 text-[13px] capitalize peer-checked:border-forest peer-checked:bg-forest peer-checked:text-paper">
                            {v}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="p-problem" className="field-label">Biggest admin problem *</label>
                    <textarea id="p-problem" rows={2} className="field resize-y" value={data.biggestProblem} onChange={(e) => set('biggestProblem', e.target.value)} />
                    {err('biggestProblem')}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex items-start gap-2.5 text-sm text-ink/75">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[#153D32]"
                        checked={data.partnerInterest}
                        onChange={(e) => set('partnerInterest', e.target.checked)}
                      />
                      I am interested in partnership/research support
                    </label>
                  </div>
                </div>

                {(status === 'error' || status === 'uk-only') && (
                  <p role="alert" className="mt-4 rounded-lg bg-[#FBE9E4] px-4 py-3 text-[13px] text-[#B3422E]">
                    {status === 'uk-only'
                      ? 'The Beelo pilot is currently available to UK residents only.'
                      : CONTENT.pilot.error}
                  </p>
                )}

                <button type="submit" disabled={status === 'sending'} className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto">
                  {status === 'sending' ? (
                    <>
                      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />
                      Sending…
                    </>
                  ) : (
                    CONTENT.pilot.cta
                  )}
                </button>
                <p className="mt-3 text-xs leading-relaxed text-ink/55">{CONTENT.pilot.reassurance}</p>
                <p id="pilot-privacy" className="mt-2 scroll-mt-24 text-xs leading-relaxed text-ink/45">{CONTENT.pilot.privacy}</p>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
