#!/usr/bin/env node
// One command to check the whole app:   npm test        (quick: ~1 minute)
//                                        npm run test:full   (also builds the Android bundle)
// Flags: --full   also run the Android bundle build
//        --update-baseline   accept today's lint error count as the new baseline
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const full = args.has("--full");
const baselineFile = join(root, "scripts", "lint-baseline.json");

const run = (cmd, opts = {}) => spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
const results = [];

function step(name, fn) {
  process.stdout.write(`\n▶ ${name}\n`);
  const t = Date.now();
  let r;
  try {
    r = fn();
  } catch (e) {
    r = { ok: false, note: e instanceof Error ? e.message : String(e) };
  }
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  results.push({ name, secs, ...r });
  console.log(`${r.ok ? "✔" : "✖"} ${name} (${secs}s)${r.note ? ` - ${r.note}` : ""}`);
}

const tail = (s, n = 25) => (s || "").trim().split(/\r?\n/).slice(-n).join("\n");

step("Unit + project checks (node --test)", () => {
  const r = run('node --no-warnings --test "tests/*.test.mjs"');
  console.log(tail(r.stdout + r.stderr, 40));
  return { ok: r.status === 0 };
});

step("Type check (tsc)", () => {
  const r = run("npx tsc --noEmit");
  if (r.status !== 0) console.log(tail(r.stdout + r.stderr, 40));
  return { ok: r.status === 0 };
});

step("Lint (no NEW errors vs baseline)", () => {
  const out = join(mkdtempSync(join(tmpdir(), "lint-")), "lint.json");
  run(`npx eslint . -f json -o "${out}"`);
  const data = JSON.parse(readFileSync(out, "utf8"));
  const errors = data.reduce((n, f) => n + f.messages.filter((m) => m.severity === 2).length, 0);
  const warnings = data.reduce((n, f) => n + f.messages.filter((m) => m.severity === 1).length, 0);
  if (args.has("--update-baseline") || !existsSync(baselineFile)) {
    writeFileSync(baselineFile, JSON.stringify({ errors }, null, 2) + "\n");
    return { ok: true, note: `baseline set to ${errors} errors` };
  }
  const base = JSON.parse(readFileSync(baselineFile, "utf8")).errors;
  if (errors > base) {
    for (const f of data) for (const m of f.messages.filter((m) => m.severity === 2)) console.log(`  ${f.filePath.replace(root, ".")}:${m.line} ${m.ruleId} ${m.message.split("\n")[0]}`);
  }
  return { ok: errors <= base, note: `${errors} errors (baseline ${base}), ${warnings} warnings${errors < base ? " - run with --update-baseline to lock in the improvement" : ""}` };
});

step("Expo health (expo-doctor)", () => {
  const r = run("npx expo-doctor");
  const text = r.stdout + r.stderr;
  const passed = /(\d+)\/(\d+) checks passed/.exec(text);
  if (r.status !== 0) console.log(tail(text, 25));
  return { ok: r.status === 0, note: passed ? `${passed[1]}/${passed[2]} checks` : undefined };
});

if (full) {
  step("Android bundle build (expo export)", () => {
    const out = mkdtempSync(join(tmpdir(), "export-"));
    const r = run(`npx expo export --platform android --output-dir "${out}"`);
    rmSync(out, { recursive: true, force: true });
    if (r.status !== 0) console.log(tail(r.stdout + r.stderr, 30));
    return { ok: r.status === 0 };
  });
}

console.log("\n──────── Summary ────────");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(42)} ${r.secs}s${r.note ? `  ${r.note}` : ""}`);
if (!full) console.log("(skipped: Android bundle build; run `npm run test:full` to include it)");
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? "\n✔ All checks passed" : `\n✖ ${failed} check${failed > 1 ? "s" : ""} failed`);
process.exit(failed === 0 ? 0 : 1);
