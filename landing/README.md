# Beelo — Landing Page

Pilot-stage, founder-led landing page for **Beelo**, an offline-capable AI
operational-memory tool for solo field professionals.

Built with **React + TypeScript + Vite + Tailwind CSS**. Mobile-first,
semantic HTML, WCAG-conscious contrast, reveal-on-scroll with
reduced-motion support, and functional forms with a mock handler.

---

## Quick start

```bash
cd landing
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build locally
```

Requires Node 18+.

## Structure

```
landing/
  index.html                 # meta, title, theme colour
  vite.config.ts
  tailwind.config.js         # maps design tokens → Tailwind utilities
  postcss.config.js
  src/
    index.css                # DESIGN TOKENS + base styles + shared classes
    data/content.ts          # ← ALL editable copy lives here
    lib/forms.ts             # validation + form submission (mock by default)
    components/
      Banner.tsx             # pilot announcement banner
      Hero.tsx               # headline + real Beelo phone mockups
      Problem.tsx            # disconnected-apps flow
      Solution.tsx           # four feature blocks
      HowItWorks.tsx         # 4-step sequence
      BuiltForOne.tsx        # dark section + two phone screens
      Founder.tsx            # founder story + quote
      Trust.tsx              # "Beelo does / You decide"
      Pilot.tsx              # pilot application form
      Partner.tsx            # partnership enquiry form
      Footer.tsx             # wordmark, contact, links, status
      DeviceFrame.tsx        # CSS phone frame for real screenshots
      Reveal.tsx             # IntersectionObserver reveal
      Section.tsx            # shared section wrapper
    assets/shots/            # real Beelo app screenshots (swap to update)
    App.tsx
    main.tsx
```

## Design tokens

The single source of truth is `src/index.css` (`:root` custom
properties), mapped into Tailwind in `tailwind.config.js`:

| Token      | Value    | Use                                    |
|------------|----------|----------------------------------------|
| `--color-ink`   | `#121212` | Text on light, darkest surfaces       |
| `--color-paper` | `#F7F6F2` | Page background (warm off-white)      |
| `--color-forest`| `#153D32` | Primary brand / dark sections         |
| `--color-sage`  | `#DDEFE4` | Tints, highlights on forest           |
| `--color-clay`  | `#C07A53` | Tiny accents only                     |

Typography is a system sans stack (`-apple-system` → Inter/Manrope →
system fallbacks); no webfont downloads, which keeps Lighthouse clean.

## Forms

Both forms validate client-side and submit to `VITE_FORM_ENDPOINT`
(JSON POST, expects `{ ok: true }`). **If the env var is unset the
forms use a built-in mock handler** (900ms delay → success), so the page
works without a backend.

```bash
# landing/.env.local
VITE_FORM_ENDPOINT=https://your-endpoint.example.com/forms
```

Suggested backends: a Vercel serverless function, Formspree, or Netlify
Forms (adapt `src/lib/forms.ts` to the provider's shape).

## Before launch — replace these (search for `TODO:`)

1. **Email address** — `src/data/content.ts` → `email`
2. **Form endpoint** — `VITE_FORM_ENDPOINT` in `.env.local`
3. **Product screenshots** — swap files in `src/assets/shots/`
   (keep the same filenames, or update the imports in `Hero.tsx` /
   `BuiltForOne.tsx`)
4. **Founder name / quote / story** — `src/data/content.ts` →
   `founderName`, `founder.quote`, `founder.body`
5. **Pilot application destination** — the form endpoint above, or
   point the success copy to a real process
6. **Privacy policy + LinkedIn URLs** — `src/data/content.ts` →
   `footer.privacyHref`, `footer.linkedinHref`

## Deployment

Any static host works — the build is plain `dist/` with a relative base.

**Vercel (recommended):**

```bash
cd landing
vercel --prod
```

**Netlify:**

```bash
cd landing
npm run build
# publish dist/, build command `npm run build`, output `dist`
```

This project is separate from the Beelo PWA repo deployment — deploy it
to its own project/subdomain (e.g. `beelo.co.uk`).

## Accessibility & performance

- Semantic landmarks, labelled forms, `aria-live` statuses, focus
  rings, keyboard-navigable.
- Contrast checked for the core pairs (off-white on forest ≈ 12:1,
  charcoal on off-white ≈ 17:1).
- Reveal animations disabled under `prefers-reduced-motion`.
- No external images or webfonts; screenshots are local assets.
