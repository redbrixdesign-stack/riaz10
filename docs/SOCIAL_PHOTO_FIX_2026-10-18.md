# Social photo selection fix — local, not deployed

The production-baseline action dispatcher omitted `SocialFeature` from its allowed action objects. The native file picker could open, but its change event could not call `selectMedia`. Caption generation and sharing actions were affected by the same omission.

Added the optional/lazy-loaded `SocialFeature` resolver to the dispatcher and rebuilt its minified asset. No storage schema or other feature behavior changed.

Verification: mobile-sized Chromium browser test opens the picker through the visible button, selects a synthetic PNG, checks the selected filename, confirms permission/privacy, and generates editable offline captions through the visible button. Passed with no browser errors. Social unit tests, action-router tests, build and diff checks passed. The browser fixture uses a fresh isolated context and synthetic appointment; no real customer data or social publishing involved.

Not yet verified on physical iPhone or deployed. Before release, increment the app asset token and service-worker cache version. Native social-app attachment compatibility remains a separate concern.
