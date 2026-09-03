/* Beelo transcription proxy. Audio is accepted only on an explicit client
   request, forwarded to OpenAI, and never persisted by this function. */

const OPENAI_TRANSCRIPTION_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 14 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = ['audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav'];

function send(res, status, body, origin = '') {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (origin) res.setHeader('access-control-allow-origin', origin);
  res.end(JSON.stringify(body));
}

function header(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw Object.assign(new Error('too_large'), { status: 413 });
  }
  return JSON.parse(raw || '{}');
}

export default async function handler(req, res) {
  const configuredOrigin = String(process.env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
  const requestOrigin = header(req, 'origin').replace(/\/$/, '');
  const production = process.env.NODE_ENV === 'production';
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    if (configuredOrigin) res.setHeader('access-control-allow-origin', configuredOrigin);
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, x-ai-key');
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' }, configuredOrigin);
  if (production && (!configuredOrigin || !process.env.AI_SECRET || !process.env.OPENAI_API_KEY)) {
    return send(res, 500, { ok: false, error: 'not_configured', message: 'Transcription is not configured' }, configuredOrigin);
  }
  if (configuredOrigin && requestOrigin !== configuredOrigin) {
    console.warn('[transcribe] rejected origin', { hasOrigin: !!requestOrigin });
    return send(res, 403, { ok: false, error: 'origin_not_allowed', message: 'This Beelo address is not authorised for transcription' }, configuredOrigin);
  }
  if (process.env.AI_SECRET && header(req, 'x-ai-key') !== process.env.AI_SECRET) {
    console.warn('[transcribe] rejected device credential', { credentialPresent: !!header(req, 'x-ai-key') });
    return send(res, 403, { ok: false, error: 'forbidden', message: 'This device needs registering again' }, configuredOrigin || requestOrigin);
  }

  try {
    const body = await readJson(req);
    const mediaType = String(body.mediaType || '').split(';')[0].toLowerCase();
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) return send(res, 415, { ok: false, error: 'unsupported_audio' }, configuredOrigin || requestOrigin);
    if (typeof body.audio !== 'string' || !body.audio) return send(res, 400, { ok: false, error: 'audio_required' }, configuredOrigin || requestOrigin);
    const audio = Buffer.from(body.audio, 'base64');
    if (!audio.length || audio.length > MAX_AUDIO_BYTES) return send(res, 413, { ok: false, error: 'audio_too_large' }, configuredOrigin || requestOrigin);

    const extension = mediaType.includes('mp4') || mediaType.includes('m4a') ? 'm4a' : mediaType.includes('mpeg') || mediaType.includes('mp3') ? 'mp3' : mediaType.includes('ogg') ? 'ogg' : mediaType.includes('wav') ? 'wav' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mediaType }), `beelo-note.${extension}`);
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
    form.append('language', 'en');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let upstream;
    try {
      upstream = await fetch(OPENAI_TRANSCRIPTION_ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: controller.signal });
    } finally { clearTimeout(timer); }
    if (!upstream.ok) return send(res, upstream.status === 429 ? 429 : 502, { ok: false, error: upstream.status === 429 ? 'rate_limited' : 'upstream', message: 'Transcription service is unavailable' }, configuredOrigin || requestOrigin);
    const result = await upstream.json();
    const text = String(result.text || '').trim();
    if (!text) return send(res, 502, { ok: false, error: 'empty_transcript', message: 'No speech could be transcribed' }, configuredOrigin || requestOrigin);
    return send(res, 200, { ok: true, text, model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe' }, configuredOrigin || requestOrigin);
  } catch (error) {
    if (error?.status === 413) return send(res, 413, { ok: false, error: 'body_too_large' }, configuredOrigin || requestOrigin);
    if (error?.name === 'AbortError') return send(res, 504, { ok: false, error: 'timeout', message: 'Transcription timed out' }, configuredOrigin || requestOrigin);
    return send(res, 400, { ok: false, error: 'invalid_request', message: 'The audio request could not be read' }, configuredOrigin || requestOrigin);
  }
}
