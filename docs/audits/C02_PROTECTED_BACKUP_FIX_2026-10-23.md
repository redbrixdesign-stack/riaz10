# C02 — Large protected backups

Implemented and tested; release evidence appended after deployment.

- Bounded 8 KiB base64 conversion replaces whole-ciphertext argument spreading; decode uses a byte loop rather than a character-array expansion. AES-GCM/PBKDF2, marker, salt/IV layout and backup envelope stay compatible.
- Removed a redundant second database export when recording metadata; metadata records the actual encrypted filename and is not advanced if export/download initiation fails. This is evidence of download initiation, not OS-level confirmation that the user retained the file.
- Added a clearly labelled protected-backup action alongside the unchanged standard JSON action, with a readable-file warning. New backup passwords require matching confirmation and at least eight characters; old backup passwords remain accepted on import.
- Fixed the formerly hidden/broken encrypted-restore dialog: standalone active accessible overlay, direct event listeners, no invalid window.ExportService reference; cancel/Escape/backdrop and keyboard containment, duplicate-dialog guard. No app-wide modal change.
- Full npm suite passes including source/minified 4 MB/Unicode roundtrip, wrong-password/truncated data rejection, legacy-format compatibility, secret exclusion, filename and export-failure metadata. Chromium/WebKit download/restore journeys pass >1 MB audio, photo/notes byte equality, real different-device passphrase, wrong-password/declined-restore preservation and reload; no uploads. C01 live-equivalent payment journeys still pass.
- Cache `advisoros-v6-143-protected-backup`; export v12, lazy registry v7, Settings v24. No database migration, account/provider/secret change or real customer data touched. Physical iPhone Files/download behaviour remains unverified.
- Prior source `36e8231`, deployment `dpl_Gz8iEUvsgk4t6E78Mp8XgV4zjiRS` is rollback target. Unrelated original-tree work preserved; other audit fixes proceed separately.
