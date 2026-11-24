# Incomplete game download recovery — 0.8.7

## Confirmed cause

The affected real Edge tab reported `Invalid binary data file size!` with a file
length of 14,765,791. Its exact Unity data cache entry had that same length, with
no length/encoding headers. The bundled source decompresses to 42,434,900 bytes.
This is evidence of an incomplete cached download, not evidence of GPU failure.
Real room snapshots and raw browser logs remain in local temporary files only.

## Changes and checks

- Migrate compressed data requests to a new stable query key and bypass Unity's
  separate CacheStorage copy. Local uncompressed Android data URLs stay unchanged.
- Use Cloudflare FixedLengthStream for the assembled gzip response, including
  Content-Length and exposed length/ETag. Too few or too many source bytes reject.
- Give download, capability and graphics errors distinct explanations; expose
  the bounded original failure text under Technical details.
- All 424 tests pass across 45 files; both TypeScript targets pass.
- The separate real local Worker fixture confirms actual FixedLengthStream
  behavior: complete bytes and Content-Length agree, and a truncated part fails.
  Reproduce with `node Browser/scripts/verify-unity-stream.mjs` from the repo root.

## Public acceptance

Worker 097d562e-eb77-4cf3-bd7c-7fc5659e54fa serves all five retained renderer
streams under the migrated query with the correct Content-Length, gzip encoding,
CORS and compressed SHA-256. Older cached query-less responses can still lack a
length, which is why migrating the data URL is essential.

The affected real Edge tab was reloaded into the same room/seat. It requested
the new data URL with a 30,946,821-byte compressed Content-Length and reached
`unity-ready`. New error logs were empty. No gameplay action was sent. The full
serialized room snapshot was byte-for-byte identical before deployment and after
restoration. See `edge-download-recovery-0.8.7.json` and
`affected-room-preserved-0.8.7.json`; player names and room codes are excluded.
The restored-board screenshot remains local because it contains the real roster.

Pages run 45371674610 passed and published the client fix. The APK and signed AAB
each contain the verified local web bundle and retain the existing upload
certificate. Public release downloads are checked separately against these files.

Browser checks do not replace physical Android performance testing.
