# C02 — Large protected backups

Implemented, deployed and live-verified on 23 October 2026.

- Source `11f34a7`; deployment `dpl_CnZt9jMYeMCGezo5RDTkVQT7k2EC` (`https://beelo1-4e9ns7p5v-beelomvp.vercel.app`), 9-second build. Staged with no custom-domain change, checked, then promoted to `https://beelo.beelestial.co.uk/`.
- Staged and live index, service worker, export, lazy registry and Settings assets match the committed build byte-for-byte. Live Chromium and WebKit journeys passed the same >1 MB/different-device-key restore, rejected/cancelled-restore preservation and reload assertions. No uploads or provider calls. Log: `/private/tmp/beelo-c02-live.log`; screenshots: `/private/tmp/beelo-protected-backup-chromium.png` and `/private/tmp/beelo-protected-backup-webkit.png` (temporary local artifacts).

- Bounded 8 KiB base64 conversion replaces whole-ciphertext argument spreading; decode uses a byte loop rather than a character-array expansion. AES-GCM/PBKDF2, marker, salt/IV layout and backup envelope stay compatible.
- Removed a redundant second database export when recording metadata; metadata records the actual encrypted filename and is not advanced if export/download initiation fails. This is evidence of download initiation, not OS-level confirmation that the user retained the file.
- Added a clearly labelled protected-backup action alongside the unchanged standard JSON action, with a readable-file warning. New backup passwords require matching confirmation and at least eight characters; old backup passwords remain accepted on import.
- Fixed the formerly hidden/broken encrypted-restore dialog: standalone active accessible overlay, direct event listeners, no invalid window.ExportService reference; cancel/Escape/backdrop and keyboard containment, duplicate-dialog guard. No app-wide modal change.
- Full npm suite passes including source/minified 4 MB/Unicode roundtrip, wrong-password/truncated data rejection, legacy-format compatibility, secret exclusion, filename and export-failure metadata. Chromium/WebKit download/restore journeys pass >1 MB audio, photo/notes byte equality, real different-device passphrase, wrong-password/declined-restore preservation and reload; no uploads. C01 live-equivalent payment journeys still pass.
- Cache `advisoros-v6-143-protected-backup`; export v12, lazy registry v7, Settings v24. No database migration, account/provider/secret change or real customer data touched. Physical iPhone Files/download behaviour remains unverified.
- Prior source `36e8231`, deployment `dpl_Gz8iEUvsgk4t6E78Mp8XgV4zjiRS` is rollback target. Unrelated original-tree work preserved; other audit fixes proceed separately.
