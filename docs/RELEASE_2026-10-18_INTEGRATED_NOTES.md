# Integrated Beelo release — 18 October 2026

Production candidate: dpl_FRARPqhEj3hviBLpQ2NJ1WmvTa5p.
Baseline: e5cace2 (deployed fitting release), based on 720772e.
Cache: advisoros-v6-119-integrated-notes.

Restores the OpenAI transcription endpoint, unified audio/text notes, measurement
product descriptions and minimum-dimension tables, scan appointment-type review,
customer context, communication deadlines and local approved visit summaries.
Preserves production contact preferences, confirmed-send lifecycle, reply history,
social posts, lazy loading, WhatsApp normalization and fitting booking.
The separate developer mock is excluded from deployment; in-app summaries remain
explicitly labelled local review, with no Azure service or autonomous messages.

Fixes notes-editor destruction during audio deletion, stale transcription responses,
repeated transcription requests, misleading recording-save copy, returning-customer
deadline classification and archive storage retries. Measurement audio now exports
as readable backup content and re-encrypts on import. OCR test clock is fixed and
its assertions now cause a nonzero failure exit.

Verification: build, complete npm test (including new regression suites), source
and minified lifecycle tests, offline approved-summary browser test, mobile notes
transcription/deletion/save/reload browser test and retained social/contact routes.
Provider responses were mocked in functional tests. Staged production POST without
credential returns 403 forbidden, confirming route/origin/configuration checks.
No keys retrieved or changed. Actual provider transcription and physical iPhone
acceptance remain unverified. Existing user working tree is preserved separately.
