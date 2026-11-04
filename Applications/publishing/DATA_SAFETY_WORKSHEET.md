# Data Safety and audience worksheet — Play test candidate

Draft for the actual Play Console form; not a submitted declaration or a legal
certification. Recheck after any SDK, hosting, account or monetization change.

## Current implementation

| Surface | Current behaviour | Review in Play Console |
| --- | --- | --- |
| Guest nickname | User enters a nickname; it is saved locally and sent with the room roster. | Personal info/name classification; purpose is gameplay. Do not claim no data collection. |
| Player/room IDs | Random seat IDs and room codes associate a returning installation with a room. | User identifiers; local and server retention. No email/password sign-in. |
| Game activity | Positions, dice, balances, deeds, auctions, trades and recent game history are saved by the room server and visible to room participants. | App interactions and any relevant user-content classifications. Virtual game money is not a real payment. |
| Network/hosting | Requests go to Cloudflare for rooms/assets and GitHub Pages for the browser game. Providers receive connection information; server errors can be logged. | Review provider processing/retention and the form's collection/sharing definitions, including user-initiated room sharing. |
| Device storage | Profile, settings, selected pieces, seats and preview receipts are local. Android backup settings can include application data. | Explain local removal and the effect on saved-seat access. |
| Advertising/payment | No ad or analytics SDK, advertising identifier permission, real billing or payment details in this candidate. Preview transactions/sample ads are disabled. | Declare actual release behaviour; update before adding monetization. |

## Audience and app-content setup

- The owner selected children and adults. Do not silently change the declared
  audience to avoid Families requirements.
- There is no public matchmaking, freeform chat, photo upload, location request
  or external checkout. Players should use nicknames and invite people they know.
- A grown-up interaction gate in the preview store does not establish identity
  or parental consent. The Play candidate does not offer transactions.
- Complete the content-rating questionnaire from actual gameplay, including
  multiplayer interaction; do not invent a rating before the questionnaire.
- Add the real support email, review the privacy notice and host its final
  version. The current notice clearly labels its pending publisher contact.
- Saved rooms currently have no automatic expiry. Provide a workable private
  privacy/deletion contact before public release. Clearing app storage does not
  delete shared server records.
- Guest play does not create a cloud account. Do not add Google sign-in or
  account-deletion claims without implementing and testing those flows.

Official reference pages checked 4 November 2026:

- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/9867159
- https://support.google.com/googleplay/android-developer/answer/9859455
