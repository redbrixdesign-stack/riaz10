/* ============================================================
   FORM HANDLING
   Both forms (pilot + partner) submit to the same configurable
   endpoint. By default they simulate a successful send so the
   page works without a backend — wire it up by setting
   VITE_FORM_ENDPOINT in .env (see README).
   ============================================================ */

export interface PilotFormData {
  name: string;
  email: string;
  phone: string;
  trade: string;
  area: string;
  worksAlone: 'yes' | 'no' | 'sometimes';
  currentTools: string;
  biggestProblem: string;
  partnerInterest: boolean;
}

export interface PartnerFormData {
  name: string;
  email: string;
  organisation: string;
  message: string;
}

/* TODO: replace with the real form endpoint, e.g. a Vercel function or
   Formspree/Netlify Forms URL. Leave unset to keep the mock handler. */
const ENDPOINT = import.meta.env.VITE_FORM_ENDPOINT as string | undefined;

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function validatePilot(d: PilotFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = 'Please enter your name.';
  if (!isValidEmail(d.email)) errors.email = 'Please enter a valid email address.';
  if (!d.phone.trim()) errors.phone = 'Please enter a phone number.';
  if (!d.trade.trim()) errors.trade = 'Please tell us your trade or role.';
  if (!d.area.trim()) errors.area = 'Please add an area or postcode.';
  if (!d.currentTools.trim()) errors.currentTools = 'Please tell us what you currently use.';
  if (!d.biggestProblem.trim()) errors.biggestProblem = 'Please describe your biggest admin problem.';
  return errors;
}

export function validatePartner(d: PartnerFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = 'Please enter your name.';
  if (!isValidEmail(d.email)) errors.email = 'Please enter a valid email address.';
  if (!d.message.trim()) errors.message = 'Please tell us a little about the partnership you have in mind.';
  return errors;
}

/**
 * Submit a form payload. When ENDPOINT is unset this resolves after a
 * short delay with a success flag (mock handler). When set, it POSTs
 * JSON to the endpoint and expects `{ ok: true }`.
 */
export async function submitForm(payload: Record<string, unknown>): Promise<{ ok: boolean }> {
  if (!ENDPOINT) {
    await new Promise((r) => setTimeout(r, 900)); // simulate network
    return { ok: true };
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Form request failed');
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
  return { ok: data.ok !== false };
}
