# Council rules for new Mayor matches

Set city desk `council: true` at START. Saved desks without this flag preserve
their Mayor policies, tally outcome, and match progress. No other mode changes.
All entries are reducer actions or deterministic effects of an accepted action.

- One project per Mayor term, proposed before the end of their turn. Six choices
  total: Emergency Loans, Transit Day, Cash Reserve Levy, City-Backed Auction,
  Rent Relief, or Permit Pause. The project starts at the next round boundary and
  lasts one round. A strict majority of surviving seats can switch Emergency
  Loans and Transit Day or cancel a proposal for any of the four new projects.
  Casting a vote cannot pause any other play. The Speaker is the next surviving seat
  clockwise from the Mayor in matches with three or more survivors. The Speaker
  can open one challenge per term without spending the table's match-wide challenge.
  A proposal keeps a stable term ID and closed votes cannot be replayed.
- Cash Reserve Levy applies at the start of the next round. At most one survivor
  holds more than half the posted table cash and also has at least ₹2,000.
  That player pays 20% of their cash above ₹1,500, rounded down, capped at ₹300.
  It can apply to any seat, including the Mayor. Once collected, unavailable for the
  rest of the match. The city fund gets the proceeds. The Mayor can propose it
  when someone currently qualifies. If nobody qualifies when the round opens,
  record the outcome and keep the levy available for later terms.
- City-Backed Auction covers the first deed auction in the round that can offer
  credit. All solvent bidders with at most ₹400 in posted cash and no prior city borrowing
  get the same credit ceiling of up to ₹200 from the available city fund. Bids
  use cash first. Only the winner borrows, only their shortfall, and repayment is
  112.5% rounded up via ordinary City Hall debt. An auction that opens with
  eligible bidders spends the policy, even if they all pass. There is no credit
  on direct purchases and no second city loan.
- Rent Relief targets a colour group. For a player's first chargeable rent
  there that round, the reduction is half the rent rounded down, capped at ₹250.
  The owner receives the reduced rent. An own or mortgaged deed cannot spend the
  relief. Permit Pause blocks new construction in one group. Sales, mortgages,
  trading and all existing rent continue under their ordinary rules.
- Each seat can optionally choose one private City Contract by the end of its
  second round. Develop a District requires a clear colour set with at least four
  building levels across it. Connect the City requires two unmortgaged stations
  and one completed Express ride. Either is worth ₹150 once from the bank.
  Proposal and contract outcomes generate public headlines. Uncompleted contracts
  are visible only in that seat's snapshot.
