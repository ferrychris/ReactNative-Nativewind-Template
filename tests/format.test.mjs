import test from "node:test";
import assert from "node:assert/strict";
import { usd, compact, initialsOf, lapTime, USERNAME_RE, timeAgoLong } from "../lib/format.ts";

test("usd formats cents as dollars", () => {
  assert.equal(usd(0), "$0.00");
  assert.equal(usd(50000), "$500.00");
  assert.equal(usd(123456), "$1,234.56");
});

test("compact shortens big numbers", () => {
  assert.equal(compact(999), "999");
  assert.equal(compact(1500), "1.5K");
  assert.equal(compact(128400), "128K");
  assert.equal(compact(1_900_000), "1.9M");
  assert.equal(compact(2_000_000), "2M");
});

test("initialsOf takes up to two capital letters", () => {
  assert.equal(initialsOf("Elena Rossi"), "ER");
  assert.equal(initialsOf("marcus"), "M");
  assert.equal(initialsOf("  "), "?");
});

test("lapTime shows m:ss.mmm", () => {
  assert.equal(lapTime(null), "—");
  assert.equal(lapTime(83456), "1:23.456");
});

test("usernames: 3-24 of a-z 0-9 . _", () => {
  for (const ok of ["elena_rossi23", "a.b", "abc"]) assert.ok(USERNAME_RE.test(ok), ok);
  for (const bad of ["ab", "Has Space", "UPPER", "x".repeat(25), "@name"]) assert.ok(!USERNAME_RE.test(bad), bad);
});

test("timeAgoLong wording", () => {
  assert.equal(timeAgoLong(new Date().toISOString()), "just now");
  assert.equal(timeAgoLong(new Date(Date.now() - 5 * 60_000).toISOString()), "5m ago");
});
