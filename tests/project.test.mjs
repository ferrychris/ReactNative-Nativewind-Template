import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));

test("app.json: Heatlap branding and dark splash", () => {
  const { expo } = json("app.json");
  assert.equal(expo.name, "Heatlap");
  assert.ok(!/RacerPro|OnlyRaceFans/i.test(JSON.stringify(expo.ios.infoPlist)), "permission texts still use an old name");
  const splash = expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-splash-screen")[1];
  assert.equal(splash.backgroundColor, "#0b0b0d");
  assert.equal(splash.dark.backgroundColor, "#0b0b0d");
});

test("package.json: native peer dependency expo-asset is installed (expo-audio needs it)", () => {
  assert.ok(json("package.json").dependencies["expo-asset"]);
});

test("eas.json has a production profile for the Play Store bundle", () => {
  const eas = json("eas.json");
  assert.ok(eas.build.production);
  assert.notEqual(eas.build.production.android?.buildType, "apk", "production must build an .aab, not an .apk");
});

test("secrets: .env is git-ignored and no secret is exposed through EXPO_PUBLIC_", () => {
  assert.match(read(".gitignore"), /^\.env$/m);
  if (existsSync(join(root, ".env"))) {
    const names = read(".env").split(/\r?\n/).map((l) => l.split("=")[0].trim()).filter((n) => n && !n.startsWith("#"));
    for (const n of names.filter((n) => n.startsWith("EXPO_PUBLIC_"))) {
      assert.ok(!/SERVICE|SECRET|PRIVATE/i.test(n), `${n} would be bundled into the app`);
    }
  }
});

test("source: image sizes come from one place (no hard-coded 1600 / 512 widths)", () => {
  for (const f of ["lib/api/deals.ts", "lib/api/profiles.ts", "lib/api/results.ts"]) {
    assert.ok(!/prepareImage\([^)]*\b(1600|512)\b/.test(read(f)), `${f} hard-codes an image width`);
  }
});

test("source: no leftover paddock / bulletin labels on the feed card", () => {
  const card = read("components/post/PostCard.tsx");
  assert.ok(!/PADDOCK \/\/ FEED|BULLETIN \/\//.test(card));
});

test("database migrations: nothing after the rebuild drops or truncates tables", () => {
  const dir = join(root, "..", "onlyracefansaug1", "supabase", "migrations");
  if (!existsSync(dir)) return; // the web repo isn't next to this one
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql") && f >= "20261001");
  assert.ok(files.length > 0);
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8").replace(/--.*$/gm, "");
    assert.ok(!/\bDROP\s+TABLE\b|\bTRUNCATE\b/i.test(sql), `${f} drops or truncates a table`);
  }
});
