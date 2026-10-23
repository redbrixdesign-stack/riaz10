/* ============================================
   Beelo — Lighthouse CI config (Phase 6)
   Asserts a floor for the launch checklist against the live URL.
   Notes:
   - Beelo's first-run shows the encryption-passphrase sheet before
     onboarding, so Performance/LCP reflects the real first-visit modal —
     keep the enforced floor realistic while tracking 90+ as the release goal.
   - Lighthouse 12+ removed the PWA category and its audit IDs
     (installable-manifest / service-worker / apple-touch-icon). PWA
     installability is instead gated by tests/browser/verify-live.js
     (SW install + offline shell + icons) and manifest.json returning 200.
   Run: npm run audit:performance
   The maintained Lighthouse runner retains these same floors and writes
   local JSON/HTML evidence; CI retains reports as workflow artifacts.
   ============================================ */
module.exports = {
  ci: {
    collect: {
      url: ['https://beelo.beelestial.co.uk/'],
      numberOfRuns: 1,
      settings: {
        formFactor: 'mobile',
        chromeFlags: '--headless --no-sandbox'
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.7 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        // Lighthouse 13's declared replacement for the old `viewport` audit.
        'viewport-insight': ['error', { minScore: 1 }]
      }
    }
  }
};
