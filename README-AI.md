# Adding Claude to AdvisorOS

Two pieces:

1. **`server/`** — a tiny Node/Express proxy that holds your Anthropic API
   key and exposes two endpoints. This is required because AdvisorOS is a
   static, no-backend app — an API key in client-side JS is visible to
   anyone who opens dev tools.
2. **`js/services/ai-service.js`** — drop this into your existing
   `js/services/` folder. It calls the proxy, never Anthropic directly.

## 1. Run the backend

```bash
cd server
npm install
cp .env.example .env
# edit .env, paste your real ANTHROPIC_API_KEY
npm start
```

It listens on `http://localhost:8787` by default (`/health` should return
`{"ok":true}`). Deploy it anywhere that can hold a secret env var — Render,
Fly.io, a small VPS, even a Raspberry Pi on your network. For production,
lock down the CORS origin in `server/index.js` to your actual app URL
instead of the wide-open default.

## 2. Add the client file

Copy `js/services/ai-service.js` into your project at
`js/services/ai-service.js`, and load it in `index.html` alongside your
other service scripts (before the feature scripts that will use it):

```html
<script src="js/services/ai-service.js"></script>
```

If you deploy the backend anywhere other than `localhost:8787`, set it in
your config, e.g. in `js/core/config.js`:

```js
CONFIG.aiBackendUrl = 'https://your-proxy.example.com';
```

## 3. Wire it into Scan (document parsing)

In `js/features/ocr/ocr.js`, `processImage()` currently runs Tesseract and
regex parsing. Add an AI path — simplest version, an extra button that
retries the same photo through Claude if the Tesseract result looks thin,
or a toggle the advisor can pick up front:

```js
// inside OCRFeature, near processImage()
async processImageWithAI(event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById('ocr-loading').style.display = 'block';
  try {
    this.extractedData = await AIService.parseDocument(file);
    // reuse the exact same rendering path processImage() already uses
    // to display this.extractedData in #ocr-fields
    this.renderExtractedFields(); // factor the fieldsHtml block out into
                                   // its own method if it isn't already
  } catch (e) {
    Toast.show('AI scan failed: ' + e.message, 'error');
    document.getElementById('ocr-manual').style.display = 'block';
  } finally {
    document.getElementById('ocr-loading').style.display = 'none';
  }
}
```

Tip: keep Tesseract as the offline fallback (it already works with no
network) and use Claude when online — it will read messier photos far more
reliably than the regex parser, especially for handwriting or unusual
layouts the current UI_CHROME/regex rules don't anticipate.

## 4. Wire it into Talk (message drafting)

In `js/features/talk/talk.js`, `sendMessage()` currently resolves a static
`CONFIG.templates` string via `NotificationService.processTemplate()`. Add
an "AI draft" option alongside the template one — same preview-before-send
flow, just a different source for the text:

```js
// inside TalkFeature
async draftWithAI(appointmentId, outcome) {
  const appt = await DB.db.appointments.get(appointmentId);
  const customer = appt?.customerId ? await DB.db.customers.get(appt.customerId) : null;
  Toast.show('Drafting message…', 'info');
  try {
    const message = await AIService.draftMessage({
      firstName: customer?.firstName || appt?.clientName?.split(' ')[0] || 'there',
      advisorName: CONFIG.advisorName || 'Your Advisor',
      outcome,
      appointmentDate: appt ? Utils.formatDate(appt.date) : '',
      productType: 'window coverings'
    });
    this.pendingMessage = { customerId: customer?.id || 0, phone: Utils.toWhatsAppPhone(customer?.phone || appt?.phone), appointmentId, templateKey: null };
    // reuse the same preview sheet sendMessage() builds, just with `message`
    // in place of the template-generated string
  } catch (e) {
    Toast.show('AI draft failed: ' + e.message, 'error');
  }
}
```

Always keep the message in an editable `<textarea>` before it goes to
WhatsApp — same as the existing flow — so the advisor reviews anything
Claude drafts before it's sent.

## Notes

- Nothing here auto-sends anything. `NotificationService.sendWhatsApp()`
  already only opens `wa.me` with a pre-filled message; that's unchanged.
- Cost control: document parsing sends one photo per scan; message drafting
  sends a short text prompt. Both are cheap, but if usage grows, consider
  caching or rate-limiting per advisor in the proxy.
- The proxy is intentionally minimal — no auth of its own. If you deploy it
  somewhere reachable from the internet, add at least a shared-secret header
  check before anyone else can burn your API credits.
