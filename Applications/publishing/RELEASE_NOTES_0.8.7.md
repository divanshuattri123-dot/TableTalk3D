TableTalk3D 0.8.7 fixes a confirmed Edge startup failure caused by an incomplete
cached Unity data file. The affected cache contained 14,765,791 bytes instead of
the expected 42,434,900 decompressed bytes.

The browser now bypasses the previous data URL and Unity cache entry. The server
uses a fixed-length stream so truncated responses fail instead of completing as
short game files. The new response exposes its byte length and ETag. No profile,
saved seat or shared game state is deleted to repair the download.

Startup errors distinguish interrupted downloads, unsupported browser features
and graphics interruptions, with technical details available on the error screen.
The APK still uses the same local Unity 0.8.5 renderer; its uncompressed local
data path is preserved. This release remains a test build with ads and payments
disabled and physical-device release checks pending.
