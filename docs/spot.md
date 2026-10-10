# Heatlap: Spots Feature Plan

Status: planning. Updated 2026-10-08.

## 1. Summary

A "spot" is a **part of a vehicle (or the driver) at a specific race**. A sponsor buys a zone for one race, a block of races, or a season. The same hood can have a different sponsor each week.

Version 1 sells **driver** spots: vehicle zones plus driver gear. **Team** spots come later.

## 2. Core idea: three layers

| Layer                   | Question it answers                                  | Example                     |
| ----------------------- | ---------------------------------------------------- | --------------------------- |
| Vehicle and zones       | Where on the machine can a logo go?                  | Hood, rear wing, left door  |
| Championship and events | When does it race?                                   | Series X, 12 rounds in 2027 |
| Inventory (slots)       | Which zone is free at which race, and at what price? | Hood, round 4: open, $80    |

The current model (one `sponsorship_spots` row that is either available or taken) cannot express this. It is replaced by zones plus per-event slots.

## 3. Vehicles and zones

- **Vehicle types** are templates that list the zones that exist for that kind of machine, with suggested default positions. They are not limited to one sport: sports/GT car, stock car, open-wheel, rally, motorcycle, bicycle, kart, truck/bus, boat and "other" are seeded, and more are added as data, not code.
- **A racer's vehicle** is created from a type, with their own photos: side, front, rear, top. Each zone is placed on the photo that shows it best.
- **Driver zones** (version 1): helmet, race suit, gloves. These belong to the driver, not the vehicle.
- **Team zones** (later): trailer, crew shirts, shared team car.
- A racer can own several vehicles (primary, backup, a different class). Each has its own zones.

## 4. Championships and events

- A racer picks the championship from a **searchable dropdown of series from anywhere in the world**; if theirs is missing they add it on the spot. They **enter a championship** with a specific vehicle for a season: a `championship_entries` record linking racer, series, season and vehicle.
- Races come from the existing `track_events` table, which already links to tracks and series.
- Each entry generates **inventory automatically**: one slot per enabled zone per event. A 12-round season with 6 enabled zones produces 72 slots. Nothing is entered by hand.

## 5. Pricing and discounts

- The racer sets **one base price per zone per race**. Larger zones (hood) price higher than smaller ones.
- **Per-event override:** the racer can change the price for one event, for example the feature race or a home track.
- **Discount tiers** (in version 1): the racer sets tiers by number of races, for example 4 or more races 10% off, 8 or more 20% off. The sponsor sees the saving before paying.
- **Count races, not "full season":** the discount applies to however many races the sponsor selects, so someone joining at round 5 can still get a block discount.
- **Buy now vs bidding:** tier discounts apply to buy-now prices. Bids are negotiated and get no automatic discount; the racer decides whether to accept.
- **Fees:** the platform fee is calculated on the **discounted** price, so the platform never takes a fee on money the racer didn't receive.
- **Refunds:** if a race is cancelled, the sponsor gets back what they actually paid for that race (the discounted per-race amount, not the list price). Each slot stores the price it was sold at, which keeps this exact.
- **Guardrail:** cap discounts at about 30% so a racer cannot accidentally list spots at a ruinous price (cap still to be confirmed).

## 6. Rules that make it real

- **Reserved zones.** Many championships require series sponsor decals or numbers in certain places. A series or track marks those zones as reserved, and they cannot be sold. Rules differ by series, so start with one championship and check its actual rulebook before building zone templates.
- **Exclusivity.** One sponsor per zone per race. Optionally one sponsor per category (for example one oil brand per car). Category exclusivity is undecided.
- **Vehicle changes.** If a racer swaps to a backup car or crashes, booked slots move to the new vehicle and the sponsor is notified.
- **Cancellations.** A rained-out race or a racer who misses the event follows the held-funds refund rule.
- **Proof per race.** A proof photo attaches to a booked slot at a specific event, which ties into the hold-until-proof payment plan in `plan.md`.

## 7. Flows

**Racer**

1. Pick a vehicle type and add photos.
2. Tap zones on the photo to turn them on and set prices and discount tiers.
3. Choose which championships and events the car runs; slots are generated.
4. See bookings per race on a calendar and upload proof after each event.

**Sponsor**

1. Browse racers by series, class, region and price.
2. Open a car, switch between photo angles and tap a zone.
3. Choose races: a single event, a block, or the full season. See the discount.
4. Buy at the listed price or bid; get a report after each race.

**Onboarding**

- Sign-up choice is "Driver" or "Fan." "Driver" sets the `is_racer` switch on the profile; a fan can turn it on later. "Team" is added later as a third option.

## 8. Data model sketch

| Table                   | Purpose                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `vehicle_types`         | Template with category and default zone list                                             |
| `vehicles`              | A racer's machine: type, number, class, photos                                           |
| `vehicle_zones`         | A zone on a vehicle or driver: name, photo, position, size, base price, enabled          |
| `championship_entries`  | Racer + series + season + vehicle                                                        |
| `series_reserved_zones` | Zones a series blocks from sale                                                          |
| `zone_discount_tiers`   | Per racer or zone: minimum races and percent off                                         |
| `spot_slots`            | One zone x one event: status (open, held, booked), list price, sold price, sponsor, deal |
| `sponsorship_deals`     | Central deal record, linked to one or more slots                                         |
| `deal_proofs`           | Proof photo per booked slot                                                              |

`sponsorship_spots` stays for now and migrates into `vehicle_zones` once the new tables exist.

## 9. Impact on the pending migrations

The combined migration file has not been applied (the connected Supabase tool could not reach project `jcepxnjdvsgxsraaxcyb`). **Migration 4 (sponsorship bids) must change before it is applied.**

- Today `accept_bid` sets `is_available = false` and stores one `sponsor_id` and `winning_bid_id` on the spot. That models one sponsor per spot forever.
- It must change so that bids attach to **slots**, and accepting a bid books those slots without closing the zone for other races.
- Also revisit money handling: the platform fee must apply to the discounted price, and refunds must use each slot's stored sold price.

## 10. Build order

1. Zone templates for any vehicle type plus a searchable, worldwide championship list (**done in code, migration `20261008120000` not yet applied**)
2. Racer vehicle setup with photo zones, including driver zones
3. Championship entries and automatic slot generation
4. Sponsor browse with zone and race selection
5. Discount tiers and price display
6. Booking, held funds, per-race proof
7. Per-event price overrides and reserved zones
8. Vehicle swaps and cancellation rules
9. Team spots and team accounts (later)

## 11. Decisions

**Made**

- Version 1 is driver spots (vehicle plus driver gear). Team spots later.
- Vehicle types and championships are open-ended: any sport or vehicle, any series worldwide, chosen from a searchable dropdown (2026-10-08).
- Discounts are in, tiered by number of races, set by the racer.
- Platform fee applies to the discounted price.

**Still open**

- Category exclusivity: launch feature or later.
- Discount cap: 30% or none.
- Platform fee percentage (the current `platform_fee_bps` setting is 20%, which was inherited from the old schema and is under review).

## 12. Risks

- **Zone rules differ by series.** Wrong templates mean racers list zones they are not allowed to sell. With every series open, nothing is reserved by default; reserved zones are added per series (build step 7), starting with the biggest ones, and a racer's listing must stay their own responsibility until then.
- **Complexity.** Zones x events x discounts can overwhelm racers. The editor must stay simple: sensible defaults, generated slots, one price per zone.
- **Off-platform deals.** Sponsors and racers can take a deal outside the app. Hold-until-proof, reports and offer tracking must give them a reason to stay.
- **Small ticket sizes.** If deals are small, volume and low support cost matter.
