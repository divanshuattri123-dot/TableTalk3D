# Mixed human and AI seats

Rooms keep the existing six-seat limit. One human can host with one to five AI
players; any mix with at least one human and two total players may start. The
host adds/removes AI in the lobby. Human invites remain available. AI seats take
unused colours, count toward expanding-board size, and are visibly labelled AI.
No players are converted/replaced after START. Old saves remain human-only.

Data: `Player.bot?: true`. Actions: `ADD_BOT {playerId}` and
`REMOVE_BOT {playerId,botId}`, host/lobby only. Bot names/IDs/colours are chosen
deterministically in the reducer. They obey the same START and finance rules.

The engine remains `(state, action) => newState`, with no random numbers, timers,
network or side effects. A separate deterministic policy selects a legal ordinary
action. Dice and expanding-mode card draws are filled at the server boundary.
The policy handles roll/move, purchase/decline, jail, utilities, rent claims,
property/building auctions, even building, mortgages, debt liquidation,
bankruptcy, and accepting/countering/declining human trades. AI may offer a deal
to complete a colour set, at most once per turn. AI uses no external paid model.

The authoritative server schedules only an outstanding AI decision using a
Durable Object alarm, checkpoints before broadcasting and recomputes the next
decision inside the room's serial commit queue. Presentation-aware delays keep
dice/movement readable. No alarm runs while waiting for human action or when
no viewers are connected. Rejoining resumes a saved AI decision. An alarm retry
chooses from the committed state instead of replaying a stale roll/purchase.

Acceptance: every 2–6-seat human/AI mix; unique colours; host-only add/remove;
classic/expanding sizing and starting; ordinary rule-compliant AI decisions;
human auction/trade pauses; debt/bankruptcy and mortgage transfers; saved-room
restart without duplicate moves; real server and mobile/desktop lobby checks;
versioned APK update and published browser/server without resetting old rooms.
