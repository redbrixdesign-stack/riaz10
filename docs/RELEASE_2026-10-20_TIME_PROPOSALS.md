# Time proposals and customer agreement

Plan tomorrow offers same-day UK-time proposals. Saving a proposal leaves the
booked date/time and message flags unchanged. It persists on the appointment,
can be discarded, and provides editable suggested text to copy and send manually.
Edited message text is not persisted; this is not an automatic WhatsApp handoff.

The adviser must explicitly attest customer agreement to the saved time before
reviewing the existing Move Visit form. Final save uses clash and travel checks,
rechecks proposal identity and original booking date, and records agreement with
the new date in the same appointment update. Changed/past/ambiguous UK times
are rejected. The day-before sent flag resets so an old reminder does not count
for the changed booking. Existing saved message drafts still require review.

Verification: full root regression suite, proposal browser journey, prior
tomorrow and message-draft browser tests. Proposal tests cover persistence,
no pre-agreement booking mutation, explicit checkbox, overlap rejection,
travel-warning handling, correct UK time with a New York device timezone,
agreement history, stale booking guard and discard. Synthetic data only;
no real communication. Physical iPhone acceptance remains outstanding.

Scope: no external company diary sync, reply detection, route optimisation,
cross-day proposals or autonomous sending. Agreement is adviser-reported,
not independently verified. Existing ordinary rescheduling remains available.

Cache `advisoros-v6-126-time-proposals`.
Previous production: `3a1e8e8`, `dpl_HS9L45XSoPUZLtsyb5JdCSHXq6En`.
