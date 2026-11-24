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

Public acceptance and affected-tab restoration are recorded after deployment.
Browser checks do not replace physical Android performance testing.
