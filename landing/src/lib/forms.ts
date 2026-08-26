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
  ukResident: boolean;
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

/* IONOS executes the production PHP handler. An environment override keeps
   preview deployments flexible without putting credentials in the bundle. */
const ENDPOINT = (import.meta.env.VITE_FORM_ENDPOINT as string | undefined) || '/api/pilot.php';

export const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const isValidUkPostcode = (value: string): boolean =>
  /^(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i.test(value.trim());

export function validatePilot(d: PilotFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = 'Please enter your name.';
  if (!isValidEmail(d.email)) errors.email = 'Please enter a valid email address.';
  if (!d.trade.trim()) errors.trade = 'Please tell us your trade or role.';
  if (!isValidUkPostcode(d.area)) errors.area = 'Please enter a valid UK postcode.';
  if (!d.ukResident) errors.ukResident = 'The Beelo pilot is currently open to UK residents only.';
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
 * Submit a form payload and expect `{ ok: true }` from the server.
 */
export async function submitForm(payload: Record<string, unknown>): Promise<{ ok: boolean; code?: string }> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string };
  if (!res.ok) {
    if (data.code === 'uk_only') return { ok: false, code: data.code };
    throw new Error('Form request failed');
  }
  return { ok: data.ok !== false, code: data.code };
}
