/* Command-line golden-set run. Usage: npm run eval [-- --ids g01,g02] [--json out.json] */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { runEvals } from "../src/lib/evals/run";
import { GOLDEN } from "../src/lib/evals/golden";

function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").split(/\s+#/)[0].trim();
    }
  }
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const idsArg = args.find((a) => a.startsWith("--ids="))?.slice(6) ?? (args.includes("--ids") ? args[args.indexOf("--ids") + 1] : undefined);
  const jsonOut = args.find((a) => a.startsWith("--json="))?.slice(7) ?? (args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined);
  const cases = idsArg ? GOLDEN.filter((c) => idsArg.split(",").includes(c.id)) : GOLDEN;

  const report = await runEvals({ cases, concurrency: 4 });
  const t = report.totals;
  console.log(`\nModel: ${report.mode.triager === "fake" ? "FAKE keyword model (no API key)" : report.mode.model}   threshold ${report.mode.threshold}`);
  console.log(`Passed ${t.passed}/${t.cases} (${(t.pass_rate * 100).toFixed(0)}%)  category ${(t.category_acc * 100).toFixed(0)}%  priority ${(t.priority_acc * 100).toFixed(0)}%  route ${(t.route_acc * 100).toFixed(0)}%  avg ${t.avg_latency_ms}ms  cache hits ${t.cache_hits}`);
  console.log(t.pass_rate >= report.autopilot_bar ? `Clears the ${report.autopilot_bar * 100}% autopilot bar.` : `Below the ${report.autopilot_bar * 100}% autopilot bar.`);
  console.log("");
  for (const r of report.results) {
    const exp = `${r.expected.categories.join("/")}${r.expected.priority ? ` P${r.expected.priority}` : ""} ${r.expected.route}`;
    const got = r.got.category ? `${r.got.category} P${r.got.priority} @${r.got.confidence?.toFixed(2)} ${r.got.route}` : r.error;
    console.log(`${r.pass ? "pass" : "MISS"}  ${r.id}  ${r.tags.join(",").padEnd(28)} expected ${exp.padEnd(32)} got ${got}`);
    if (!r.pass) for (const why of r.got.reasons) console.log(`         - ${why}`);
  }
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(`\nWrote ${jsonOut}`);
  }
  // --smoke: exit 0 regardless of the bar (CI with the fake model)
  process.exitCode = args.includes("--smoke") || t.pass_rate >= report.autopilot_bar ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
