# Commercial asset review

The owner states that the supplied assets are their own. This record does not
reject that claim. It records which files still need identifiable commercial-use
evidence before the publisher submits a public store release.

ASSET_RIGHTS_INVENTORY.csv lists each of the 6,430 downloadable catalog items,
its extraction source, distributed path, size and SHA-256. The collection contains
1,044 models, 5,046 images, 179 audio files and 161 data files. Optional downloadable
content is part of the release review even when it is not in the initial APK.

For each item or documented group, retain authorship/source files or the licence
and any required attribution. In asset-rights-evidence.json, a reviewed asset
record includes its current `sha256`, `commercialUse: true`, and a `document`
path relative to this directory. Do not add private contracts or personal data
to the public repository; use a public evidence summary/reference when needed.

Additional review surfaces:

- The embedded Unity city/world models, tokens, dice and their textures. Match
  them to the supplied source files and the catalog records where applicable.
- Publisher/menu graphics, map thumbnails, event character art, deed artwork,
  portraits and sounds used by the actual screens. Brand-specific artwork needs
  explicit review; a model rendering successfully does not complete that review.
- The Barlow font includes its SIL Open Font License in Browser/public/fonts.
  Preserve that licence with distributed font derivatives/embeds.
- Review third-party package licence notices separately from art ownership.

No catalogue item has been marked cleared solely because it was extracted from
an APK. The app is presented as TableTalk3D, its own property-trading game.
