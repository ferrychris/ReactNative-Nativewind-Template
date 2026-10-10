# Heatlap: Sponsorship Build Plan

Scope: the sponsorship marketplace, where a local business pays a racer for a spot on the car and gets proof and results back, all inside the app.

## 1. Goal
- A sponsor can find a racer, buy a spot, and see results without leaving the app.
- A racer can list a spot, accept a deal, and get paid without chasing anyone.
- Funds are held until proof of display is posted, so both sides can trust a stranger.

## 2. Why sponsorship leads
- Strongest revenue line: a local business paying for decal space is real money with a clear reason to exist.
- Gives the feed a purpose: posts become proof of value for sponsors.
- Competitors exist (OpenFender, KARTR), so differentiation depends on proof-of-display, verified results, local reach, and in-app offers.
- Live gifting is deferred until racers have audiences worth gifting to.

## 3. Roles
| Role | Does |
|---|---|
| Racer | Lists spots, accepts deals, posts proof, gets paid |
| Sponsor | Browses racers, buys a spot, confirms proof, views reports and rebooks |
| Admin | Resolves disputes, approves payouts when needed |

Sponsors get lightweight real accounts (business name, email, logo, payment method) instead of guest-only access. They need a place to see reports and a reason to return. The current schema has no sponsor role.

## 4. Deal lifecycle
1. List: racer lists a spot with placement, size, price per race or season, and what the sponsor gets.
2. Discover: sponsor finds the racer through browse, search, the feed, or the racer's media kit.
3. Offer: sponsor buys at the listed price or sends a custom proposal with a message.
4. Accept: racer accepts or declines. Acceptance locks the spot so it cannot be double-sold.
5. Pay: sponsor pays. Funds are held, not released.
6. Deliver: racer applies the decal, races, and uploads proof (car photo with logo, tied to a specific event).
7. Confirm: sponsor confirms, or it auto-confirms after the dispute window. Funds release to the racer minus the platform fee.
8. Report and rebook: sponsor receives a recap and a one-tap rebook.

Deal statuses: offered, accepted, paid, delivered, confirmed, disputed, refunded, declined, cancelled.

## 5. Money rules
- Processor: Stripe Connect handles sponsor payment, holding funds, and racer payouts.
- App store note: a decal on a real car is a real-world advertising service, not a digital good, so in-app purchase rules should not apply. Confirm against current Apple and Google rules before launch.
- Hold until proof: funds are released only after proof is confirmed or auto-confirmed.
- Refunds: the sponsor is refunded if the racer misses the event or never posts proof. Write this in plain language before launch.
- Season deals: release in installments per race, not all at once.
- Platform fee: the old schema assumed 80/20. That is high for a service marketplace; 10 to 15 percent is more typical. Decision needed (section 11).

## 6. What sponsors get back
- Per-deal report: tagged posts, views, offer taps, claims, and the verified race result.
- Sponsor dashboard: active deals, total spend, and results in one place.
- In-app offers: a "Claim offer" card on sponsor-tagged posts and profiles, opening a deal with a per-racer code. Racers can also share a deep link that opens straight to the offer, and live streams can show a tappable sponsor banner.
- Metrics tracked per racer: offer views, taps, claims, redemptions.

## 7. Feed features that support sponsorship
- Auto-built media kit: posts per month, followers, average engagement, recent verified results, car photos, and open spots.
- Sponsor tagging on posts: tagged sponsors can see views and engagement for that post.
- Race-day mode: "I'm racing tonight" post, then a recap draft pre-filled with the verified result.
- AI caption and recap helper: drafts only, a human approves every post, and results are never invented.
- Sponsor nudges: prompt the racer to tag the active sponsor after a race.
- Local reach: show follower location breakdown so local sponsors see local audience.

## 8. Schema
Unify the two disconnected systems (sponsorship_spots with sponsorship_inquiries, and sponsorship_packages with transactions) into one deal flow.

| Table | Purpose |
|---|---|
| sponsors | Business account profile (name, logo, contact, Stripe customer) |
| sponsorship_spots | Keep. The thing for sale |
| sponsorship_deals | Central record linking spot, sponsor, racer; status, agreed price, dates |
| deal_proofs | Proof photos tied to a deal and an event |
| deal_payments | Hold, release, and refund records tied to Stripe |
| offers | Sponsor offers shown in the app, with per-racer codes |
| offer_redemptions | Claims and redemptions per racer |
| post_views | View counts, since likes are not reach |
| post_sponsor_tags | Link a post to a sponsor and optionally an event |

Retire sponsorship_inquiries and sponsorship_packages once deals replace them.

Prerequisite: fix the open RLS policies on transactions, creator_earnings, and other money tables before any real payment flows. Any authenticated user must not be able to write to financial tables.

## 9. Screens
- Racer: spot editor on the car photo, offer inbox, deal detail with proof upload step, payout status.
- Sponsor: browse and filter racers, racer sponsor view with open spots, checkout, deals dashboard, deal report.
- Shared: deal chat, status-change notifications.

## 10. Build order
1. Fix RLS; finalize the deals schema migration
2. Sponsor accounts and browse
3. Offer, accept, and pay with held funds (Stripe Connect)
4. Proof upload, confirm, and release
5. Reports and one-tap rebooking
6. Post views and sponsor tagging
7. In-app offers, deep links, and redemptions
8. Disputes and admin tools
9. Race-day mode and AI recap helper

## 11. Open decisions
- Platform fee: what percentage?
- Pricing model: per race, per season, or both at launch?
- Sponsor accounts: real accounts (recommended) or guest checkout for the first version?
- Auto-confirm window: how many days before proof is accepted without a sponsor response?
- Launch region: which single region or class to seed first?

## 12. Risks
- Off-platform leakage: sponsor and racer can take the deal outside the app. Hold-until-proof, reports, and offer tracking must be valuable enough to keep them in.
- Fake proof or disputes: require proof photos tied to a verified event and keep a manual dispute path at first.
- Small ticket sizes: if most deals are $50 to $300, fees are thin, so volume and low support cost matter.
- Sponsor churn: weak reports mean no renewals.
- Cold start: need both racers and sponsors in one place. Seed one region with about 20 racers and 10 local sponsors.

## 13. Validation before heavy building
- Interview about 20 racers and 10 local sponsors; ask what they would pay and how they find sponsors today.
- Test whether sponsors will pay for decal space through an app. If not, rethink the model before building further.
- Define kill criteria in advance, for example fewer than a set number of paid deals in the first season in the launch region.
