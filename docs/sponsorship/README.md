# Sponsorship

Where the sponsorship feature lives:

- `components/sponsorship/` UI (today: `SponsorshipSection`, the tab on a profile)
- `lib/api/sponsorship.ts` spot and bid calls
- `app/sponsorship/` screens, added as the build plan below is delivered
- `PLAN.md` the full build plan (marketplace, held funds, proof, reports)

## Built so far (v0, wallet bids)
Any member can list a spot (`sponsorship_spots`), others place bids from their USD wallet
(`place_bid`), and the owner accepts the top bid (`accept_bid`, 20% platform fee).

## Not built yet
Everything in PLAN.md section 4 onward: deals, sponsor accounts, held funds with proof,
reports, offers. PLAN.md section 11 lists the decisions needed before the money parts.

## Decisions (confirmed)
- Platform fee 20%, stored on each deal (`fee_bps`).
- Pricing: per race and per season, both.
- Sponsors are real accounts: a normal signup, then a one-time `become_sponsor()` sets `user_type = 'sponsor'`.
- Proof window: 7 days after proof is posted the sponsor can dispute; otherwise it auto-confirms.
- Payment is added later, with Stripe Connect. Until then nothing is charged.

## Phase 1 (done): `20261005100000_sponsorship_deals.sql`
Tables `sponsors`, `sponsorship_deals`, `deal_proofs`; spot prices; functions `become_sponsor`, `make_offer`,
`respond_to_offer`, `cancel_deal`, `submit_proof`, `confirm_deal`, `dispute_deal`, plus server-only
`mark_deal_paid` and `auto_confirm_due_deals`. Tested with 35 scenario checks. Not yet applied to the live project.
