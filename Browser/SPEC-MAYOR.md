# Mayor mode

Mayor mode uses the expanding board and its ordinary purchase, auction, debt, jail,
trade and bankruptcy rules. The room chooses it before starting. Each confirmable
city action runs through the same deterministic reducer as ordinary actions.

## State and actions

`GameState.mayor` contains the office holder, term, round, per-seat turn counts,
treasury, policy proposal/result, and bounded wheel and player records. The
room checkpoint saves this state and action receipts together. Snapshots project
tax bills to the owning seat only, with a temporary offset to public balances for
early payments. Unrevealed scratch prizes are omitted from all snapshots.

`reduceGame(state: GameState, action: GameAction): GameState`
accepts CITY_PAY_TAX, CITY_DEFER_TAX, CITY_AUDIT, CITY_TIP, CITY_PROPOSE, CITY_VOTE,
CITY_LOAN, CITY_EXPRESS, CITY_SPIN, CITY_SCRATCH, and CITY_SKIP_WHEEL. Term and
wheel IDs prevent stale actions from acting on a fresh decision. The Worker
supplies independent wheel and prize draws. The reducer consumes the inputs exactly
once and never consults a clock, a random generator, or the UI.

## Turns and City Hall

- Starting player takes office. Every two rounds it passes to the next solvent
  player; a bankrupt mayor is replaced immediately. A round follows the same seat
  order even if seats are eliminated. Doubles do not increment the turn count.
- Separate treasury starts with ₹400. The first ₹100 of rent each round is exempt,
  the next ₹200 is taxed at 20%, the next ₹300 at 30%, and the remainder at 40%.
  The bill is rounded down and capped at ₹200. Early payments stay private until
  the bill's deadline. A player may defer until the end of their following turn.
  Ignoring an actionable bill pays if affordable or defers. The Mayor pays tax too.
- One warrant per term. An audit of a deferred bill makes the oldest deferred
  bill and ₹25 fine due immediately. For clear records, the Mayor owes the rival
  ₹25 compensation and still uses the warrant. With two
  survivors a deferred bill is audited automatically at the close of the
  rival's turn if the Mayor still has a warrant. With three or more, the Mayor may ask
  for one truthful tip per term naming a pair that contains a deferrer.
- One proposal per term, on the Mayor's own turn. It takes effect next round
  for one round. A rival may challenge it once per match. A majority of live
  seats can switch the policy with no interruption or required acknowledgement.
- Emergency Loans cost the fund ₹200 each and return ₹225 within two borrower
  turns. Each cash-light rival (₹400 or less) can claim one per match while
  there is funding. The sponsoring Mayor cannot borrow through their own policy.
- Due city obligations use the ordinary debt flow. City Hall receives money
  actually paid, including cash raised after an audit. Debt can delay the same
  turn until settlement. No direct deed seizure by the Mayor.

## Transit and wheel

- Before the first roll, a player on a railroad can pay ₹75 to travel to the
  next station in place of rolling. Use once until the player earns normal GO
  salary again. Express passes GO without a payout and resolves ordinary
  purchase/rent at the destination. Transit Day funds up to one free ride per
  player that round, within the same lap limit and available treasury.
- Each seat's first eligible landing at the Golconda Fort position (local
  equivalent in other cities) offers a free optional wheel after purchase,
  auction or rent. Six equally likely sections are +₹100, +₹150, ₹50 fee,
  a jail card, move to GO and collect ₹200, or Lucky Scratch.
- Lucky Scratch pays ₹100 (85%), ₹250 (12%), or ₹2,000 (3% conditional on
  reaching Scratch, 0.5% per spin while the jackpot remains). There is one
  jackpot per match. Later jackpot draws pay ₹250. A scratch prize persists
  on reload and is automatically revealed if the player ends their turn.
  The wheel, scratching and raids are cosmetic presentations of saved outcomes.
- Public city headlines record meaningful match events. No additional blocking
  waits are introduced by the Mayor, votes or wheel.
