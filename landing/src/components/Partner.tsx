import { useState, type FormEvent } from 'react';
import { CONTENT } from '../data/content';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { validatePartner, submitForm, type PartnerFormData } from '../lib/forms';

const EMPTY: PartnerFormData = { name: '', email: '', organisation: '', message: '' };
type Status = 'idle' | 'sending' | 'success' | 'error';

/** Partner enquiries — lightweight form. */
export function Partner() {
  const [data, setData] = useState<PartnerFormData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');

  const set = <K extends keyof PartnerFormData>(key: K, value: string) => {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validatePartner(data);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStatus('sending');
    try {
      const { ok } = await submitForm({ type: 'partner', ...data });
      setStatus(ok ? 'success' : 'error');
      if (ok) setData(EMPTY);
    } catch {
      setStatus('error');
    }
  };

  const err = (k: keyof PartnerFormData) =>
    errors[k] ? <p className="mt-1 text-[13px] font-medium text-[#B3422E]">{errors[k]}</p> : null;

  return (
    <Section eyebrow="Partners" heading={CONTENT.partner.heading} id="partner" className="bg-white">
      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start">
        <Reveal>
          <p className="max-w-prose text-base leading-relaxed text-ink/80">{CONTENT.partner.body}</p>
          <p className="mt-6 text-sm text-ink/60">
            Or email us directly at{' '}
            <a href={`mailto:${CONTENT.email}`} className="font-medium text-forest underline underline-offset-4 hover:text-ink">
              {CONTENT.email}
            </a>
            .
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="rounded-2xl border border-ink/8 bg-paper p-6 shadow-soft sm:p-8">
            {status === 'success' ? (
              <div role="status" className="py-8 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 text-forest" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4 10-10" />
                  </svg>
                </span>
                <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-ink/80">
                  Thank you — we will be in touch about partnership conversations.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate aria-label="Partnership enquiry form">
                <div className="grid gap-4">
                  <div className="sm:grid-cols-2 sm:grid sm:gap-4">
                    <div>
                      <label htmlFor="pt-name" className="field-label">Name *</label>
                      <input id="pt-name" className="field" value={data.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
                      {err('name')}
                    </div>
                    <div>
                      <label htmlFor="pt-email" className="field-label">Email *</label>
                      <input id="pt-email" type="email" className="field" value={data.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
                      {err('email')}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pt-org" className="field-label">Organisation</label>
                    <input id="pt-org" className="field" value={data.organisation} onChange={(e) => set('organisation', e.target.value)} autoComplete="organization" />
                  </div>
                  <div>
                    <label htmlFor="pt-message" className="field-label">What would you like to discuss? *</label>
                    <textarea id="pt-message" rows={4} className="field resize-y" value={data.message} onChange={(e) => set('message', e.target.value)} />
                    {err('message')}
                  </div>
                </div>
                {status === 'error' && (
                  <p role="alert" className="mt-4 rounded-lg bg-[#FBE9E4] px-4 py-3 text-[13px] text-[#B3422E]">
                    Something went wrong sending your message. Please try again, or email us directly.
                  </p>
                )}
                <button type="submit" disabled={status === 'sending'} className="btn-primary mt-6 w-full disabled:opacity-60 sm:w-auto">
                  {status === 'sending' ? (
                    <>
                      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />
                      Sending…
                    </>
                  ) : (
                    CONTENT.partner.cta
                  )}
                </button>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
