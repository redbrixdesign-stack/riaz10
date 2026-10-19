# Persistent communication drafts

Edited previews autosave into passphrase-encrypted device settings, keyed by appointment and template. Explicit preview close, template switch and WhatsApp handoff await saving; a failed save leaves the editor open. Appointment and Follow-ups screens provide saved-draft lists. Reopening warns to review current details. Confirmed sending removes that template's draft; closing or handoff alone does not mark sent.

Drafts are device-local and excluded from exports (to avoid exporting ciphertext tied to another installation's key). No automatic sending, reply detection, route planning or cross-device recovery is added. Drafts remain separately keyed when communication stages change; they require review and are not a promise of current wording. This release does not yet add a discard action or automatic stale-draft cleanup.

Verification: full root suite, feature smoke checks and synthetic browser test passed. Browser test covers editing, explicit close, reload, visible resume, encrypted stored value, unsent flags and confirmed-send deletion. Cache: advisoros-v6-123-message-drafts. Physical iPhone acceptance remains recommended.
