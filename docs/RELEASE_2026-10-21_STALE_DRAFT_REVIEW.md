# Stale draft review

Encrypted saved message drafts now include a booking snapshot. Reopening a draft
whose date/time, window, type, address, customer identity/contact, status or
outcome differs displays the current booking alongside preserved editable text.
Legacy drafts without snapshots also require review. No text is automatically
rewritten or discarded.

WhatsApp handoff rechecks the booking. Stale text requires an explicit review
checkbox; a further booking change clears that approval. Recipient changes while
open require reopening the preview so normal recipient and contact-preference
resolution runs again. Cancelled/missing visits cannot hand off from this screen.
Reviewed text and its current snapshot are saved before handoff. This gate does
not verify that wording was actually corrected or detect every contextual change.

Verification: full root regression suite and previous draft/planning/proposal
journeys; targeted stale-draft tests cover retained edits, review gate, legacy
drafts, changes while open and recipient refresh. All external handoffs mocked.
Final targeted test additionally run in WebKit. Physical iPhone handoff and the
previously observed WebKit offline-reload limitation remain unverified.

Cache: advisoros-v6-129-draft-review.
Rollback: 3c1e10d, dpl_C9Toypporruo8cwjtAzZzQ2vaGCd.
