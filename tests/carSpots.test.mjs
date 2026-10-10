import test from "node:test";
import assert from "node:assert/strict";
import { presetFor, spotPosition, raceRate, cheapestOpenSpot } from "../lib/carSpots.ts";

const spot = (o = {}) => ({ id: "s", placement: "Hood", xPct: 50, yPct: 50, available: true, pricePerRaceCents: null, pricePerSeasonCents: null, seasonRaces: null, ...o });

test("raceRate: per-race price wins, else season price spread over its races", () => {
  assert.equal(raceRate(spot({ pricePerRaceCents: 15000, pricePerSeasonCents: 90000, seasonRaces: 8 })), 15000);
  assert.equal(raceRate(spot({ pricePerSeasonCents: 90000, seasonRaces: 8 })), 11250);
  assert.equal(raceRate(spot({ pricePerSeasonCents: 90000 })), null); // no race count: can't compare
  assert.equal(raceRate(spot()), null);
});

test("cheapestOpenSpot picks the lowest per-race price among OPEN spots", () => {
  const spots = [
    spot({ id: "a", placement: "Hood", pricePerRaceCents: 20000 }),
    spot({ id: "b", placement: "Rear wing", pricePerRaceCents: 7500 }),
    spot({ id: "c", placement: "Roof", pricePerRaceCents: 1000, available: false }), // sold: ignored
    spot({ id: "d", placement: "Doors" }), // no price: ignored
  ];
  assert.deepEqual(cheapestOpenSpot(spots), { id: "b", cents: 7500, placement: "Rear wing" });
  assert.equal(cheapestOpenSpot([spot({ available: false, pricePerRaceCents: 100 })]), null);
  assert.equal(cheapestOpenSpot([]), null);
});

test("spotPosition: saved position, else preset by name, else staggered", () => {
  assert.deepEqual(spotPosition(spot({ xPct: 20, yPct: 70 })), [20, 70]);
  assert.deepEqual(spotPosition(spot({ placement: "Rear wing" })), presetFor("rear wing"));
  const a = spotPosition(spot({ placement: "Custom" }), 0);
  const b = spotPosition(spot({ placement: "Custom" }), 1);
  assert.notDeepEqual(a, b);
});

test("presetFor ignores case and unknown names sit in the centre", () => {
  assert.deepEqual(presetFor("  HOOD "), presetFor("hood"));
  assert.deepEqual(presetFor("nope"), [50, 50]);
});
