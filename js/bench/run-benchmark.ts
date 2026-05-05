#!/usr/bin/env tsx
import "../load-env.ts"
import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"
import { run } from "../core/runner.ts"
import { tinyfishAdapter } from "../adapters/tinyfish.ts"

interface BenchTask {
  id: string
  url: string
  goal: string
}

type Phase = "cold" | "learn" | "primed"

interface BenchRow {
  taskId: string
  url: string
  goal: string
  phase: Phase
  repeat: number
  success: boolean
  durationMs: number
  hintsLoaded: number
  hintsExtracted: number
  hintsTotal: number
  errors: string[]
  provider: string
  promptChars: number
}

interface PhaseStats {
  runs: number
  successRate: number
  avgDurationMs: number
  medianDurationMs: number
  avgHintsLoaded: number
  avgHintsExtracted: number
  blockedErrors: number
}

interface TaskSummary {
  taskId: string
  url: string
  cold: PhaseStats
  learn: PhaseStats
  primed: PhaseStats
  deltas: {
    primedVsColdSuccessPts: number
    primedVsColdAvgDurationMs: number
    primedVsColdBlockedErrors: number
  }
}

interface RegressionFlag {
  taskId: string
  flag: string
  severity: "warn" | "fail"
  message: string
}

interface CliOptions {
  tasksPath: string
  repeats: number
  outPath: string
  storeBase: string
  stealth: boolean
  proxyCountry?: string
}

const args = parseArgs(process.argv.slice(2))

const originalStorePath = process.env.MYCELIUM_STORE_PATH
process.env.MYCELIUM_LLM_EXTRACT = process.env.MYCELIUM_LLM_EXTRACT ?? "0"

const tasks = JSON.parse(readFileSync(args.tasksPath, "utf-8")) as BenchTask[]
if (!Array.isArray(tasks) || tasks.length === 0) {
  throw new Error(`No benchmark tasks found in ${args.tasksPath}`)
}

const rows: BenchRow[] = []

console.log()
console.log(`Benchmark tasks: ${tasks.length}`)
console.log(`Repeats:         ${args.repeats}`)
console.log(`Output:          ${args.outPath}`)
console.log(`Store base:      ${args.storeBase}`)
console.log(`Adapter:         TinyFish${args.stealth ? " stealth" : ""}`)
console.log()

await runPhase("cold", {
  storePath: `${args.storeBase}/cold`,
  prime: false,
  record: false,
})

await runPhase("learn", {
  storePath: `${args.storeBase}/learn`,
  prime: false,
  record: true,
})

await runPhase("primed", {
  storePath: `${args.storeBase}/learn`,
  prime: true,
  record: false,
})

mkdirSync(dirname(args.outPath), { recursive: true })
writeFileSync(args.outPath, JSON.stringify({
  ts: new Date().toISOString(),
  options: args,
  rows,
  summary: summarize(rows),
  taskSummaries: summarizeTasks(rows),
  regressionFlags: regressionFlags(rows),
}, null, 2))

printSummary(rows)
console.log()
console.log(`Wrote ${args.outPath}`)
console.log()

if (originalStorePath === undefined) {
  delete process.env.MYCELIUM_STORE_PATH
} else {
  process.env.MYCELIUM_STORE_PATH = originalStorePath
}

async function runPhase(
  phase: Phase,
  opts: { storePath: string; prime: boolean; record: boolean },
) {
  process.env.MYCELIUM_STORE_PATH = opts.storePath
  console.log(`== ${phase} ==`)

  for (let repeat = 1; repeat <= args.repeats; repeat++) {
    for (const task of tasks) {
      const adapter = tinyfishAdapter({
        browserProfile: args.stealth ? "stealth" : undefined,
        proxyConfig: args.proxyCountry
          ? { enabled: true, country_code: args.proxyCountry.toUpperCase() }
          : undefined,
      })

      const result = await run({
        url: task.url,
        goal: task.goal,
        adapter,
        prime: opts.prime,
        record: opts.record,
        silent: true,
      })

      const row: BenchRow = {
        taskId: task.id,
        url: task.url,
        goal: task.goal,
        phase,
        repeat,
        success: result.success,
        durationMs: result.durationMs,
        hintsLoaded: result.primed.hintsLoaded,
        hintsExtracted: result.recorded.hintsExtracted,
        hintsTotal: result.recorded.hintsTotal,
        errors: result.errors,
        provider: result.provider,
        promptChars: result.prompt.length,
      }
      rows.push(row)

      const status = result.success ? "ok" : "fail"
      const secs = (result.durationMs / 1000).toFixed(1)
      console.log(`  ${phase.padEnd(6)} r${repeat} ${task.id.padEnd(18)} ${status.padEnd(4)} ${secs}s hints=${result.primed.hintsLoaded}`)
      if (result.errors.length > 0) {
        console.log(`    ${result.errors[0]}`)
      }
    }
  }

  console.log()
}

function summarize(input: BenchRow[]) {
  const phases: Phase[] = ["cold", "learn", "primed"]
  return Object.fromEntries(phases.map((phase) => {
    const phaseRows = input.filter((r) => r.phase === phase)
    return [phase, {
      runs: phaseRows.length,
      successRate: avg(phaseRows.map((r) => r.success ? 1 : 0)),
      avgDurationMs: avg(phaseRows.map((r) => r.durationMs)),
      medianDurationMs: median(phaseRows.map((r) => r.durationMs)),
      avgHintsLoaded: avg(phaseRows.map((r) => r.hintsLoaded)),
      avgHintsExtracted: avg(phaseRows.map((r) => r.hintsExtracted)),
    }]
  }))
}

function printSummary(input: BenchRow[]) {
  const summary = summarize(input)
  const taskSummaries = summarizeTasks(input)
  const flags = regressionFlags(input)
  console.log("Summary")
  console.log("phase    runs  success  avg time  med time  hints loaded  hints learned")
  console.log("-----------------------------------------------------------------------")
  for (const phase of ["cold", "learn", "primed"] as Phase[]) {
    const s = summary[phase]
    console.log([
      phase.padEnd(7),
      String(s.runs).padStart(4),
      `${Math.round(s.successRate * 100)}%`.padStart(8),
      `${(s.avgDurationMs / 1000).toFixed(1)}s`.padStart(8),
      `${(s.medianDurationMs / 1000).toFixed(1)}s`.padStart(8),
      s.avgHintsLoaded.toFixed(1).padStart(12),
      s.avgHintsExtracted.toFixed(1).padStart(13),
    ].join("  "))
  }

  const cold = summary.cold
  const primed = summary.primed
  console.log()
  console.log(`Primed vs cold success: ${pctDelta(primed.successRate, cold.successRate)}`)
  console.log(`Primed vs cold avg time: ${timeDelta(primed.avgDurationMs, cold.avgDurationMs)}`)

  console.log()
  console.log("Per-task")
  console.log("taskId              cold ok  primed ok  cold avg  primed avg  hints  flags")
  console.log("----------------------------------------------------------------------------")
  for (const t of taskSummaries) {
    const taskFlags = flags.filter((f) => f.taskId === t.taskId)
    console.log([
      t.taskId.padEnd(18),
      `${Math.round(t.cold.successRate * 100)}%`.padStart(7),
      `${Math.round(t.primed.successRate * 100)}%`.padStart(9),
      `${(t.cold.avgDurationMs / 1000).toFixed(1)}s`.padStart(8),
      `${(t.primed.avgDurationMs / 1000).toFixed(1)}s`.padStart(10),
      t.primed.avgHintsLoaded.toFixed(1).padStart(5),
      taskFlags.length === 0 ? "" : taskFlags.map((f) => f.flag).join(","),
    ].join("  "))
  }

  if (flags.length > 0) {
    console.log()
    console.log("Regression flags")
    for (const f of flags) {
      const label = f.severity === "fail" ? "FAIL" : "WARN"
      console.log(`  [${label}] ${f.taskId}: ${f.message}`)
    }
  }
}

function summarizeTasks(input: BenchRow[]): TaskSummary[] {
  const taskIds = [...new Set(input.map((r) => r.taskId))]
  return taskIds.map((taskId) => {
    const first = input.find((r) => r.taskId === taskId)!
    const cold = phaseStats(input.filter((r) => r.taskId === taskId && r.phase === "cold"))
    const learn = phaseStats(input.filter((r) => r.taskId === taskId && r.phase === "learn"))
    const primed = phaseStats(input.filter((r) => r.taskId === taskId && r.phase === "primed"))
    return {
      taskId,
      url: first.url,
      cold,
      learn,
      primed,
      deltas: {
        primedVsColdSuccessPts: (primed.successRate - cold.successRate) * 100,
        primedVsColdAvgDurationMs: primed.avgDurationMs - cold.avgDurationMs,
        primedVsColdBlockedErrors: primed.blockedErrors - cold.blockedErrors,
      },
    }
  })
}

function phaseStats(rows: BenchRow[]): PhaseStats {
  return {
    runs: rows.length,
    successRate: avg(rows.map((r) => r.success ? 1 : 0)),
    avgDurationMs: avg(rows.map((r) => r.durationMs)),
    medianDurationMs: median(rows.map((r) => r.durationMs)),
    avgHintsLoaded: avg(rows.map((r) => r.hintsLoaded)),
    avgHintsExtracted: avg(rows.map((r) => r.hintsExtracted)),
    blockedErrors: rows.filter(hasBlockedError).length,
  }
}

function regressionFlags(input: BenchRow[]): RegressionFlag[] {
  const flags: RegressionFlag[] = []
  for (const t of summarizeTasks(input)) {
    if (t.deltas.primedVsColdSuccessPts <= -20) {
      flags.push({
        taskId: t.taskId,
        flag: "success_drop",
        severity: "fail",
        message: `Primed success dropped from ${pct(t.cold.successRate)} to ${pct(t.primed.successRate)}`,
      })
    }

    if (t.cold.avgDurationMs > 0 && t.primed.avgDurationMs > t.cold.avgDurationMs * 1.25) {
      flags.push({
        taskId: t.taskId,
        flag: "duration_increase",
        severity: "warn",
        message: `Primed avg time increased from ${secs(t.cold.avgDurationMs)} to ${secs(t.primed.avgDurationMs)}`,
      })
    }

    if (t.deltas.primedVsColdBlockedErrors > 0) {
      flags.push({
        taskId: t.taskId,
        flag: "blocked_error_increase",
        severity: "fail",
        message: `Primed blocked errors increased from ${t.cold.blockedErrors} to ${t.primed.blockedErrors}`,
      })
    }

    if (
      t.primed.avgHintsLoaded > 0
      && t.primed.successRate <= t.cold.successRate
      && t.primed.avgDurationMs >= t.cold.avgDurationMs
    ) {
      flags.push({
        taskId: t.taskId,
        flag: "hints_loaded_but_no_improvement",
        severity: "warn",
        message: `Primed loaded ${t.primed.avgHintsLoaded.toFixed(1)} hints but did not improve success or time`,
      })
    }

    const coldRows = input.filter((r) => r.taskId === t.taskId && r.phase === "cold")
    const primedRows = input.filter((r) => r.taskId === t.taskId && r.phase === "primed")
    const paired = Math.min(coldRows.length, primedRows.length)
    let pairedRegressions = 0
    for (let i = 0; i < paired; i++) {
      if (coldRows[i].success && !primedRows[i].success) pairedRegressions++
    }
    if (pairedRegressions > 0) {
      flags.push({
        taskId: t.taskId,
        flag: "primed_failure_after_cold_success",
        severity: "fail",
        message: `${pairedRegressions}/${paired} paired runs succeeded cold but failed primed`,
      })
    }
  }
  return flags
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    tasksPath: resolve("bench/tasks.json"),
    repeats: 1,
    outPath: resolve(`.bench/results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    storeBase: resolve(".bench/store"),
    stealth: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--tasks") opts.tasksPath = resolve(argv[++i])
    else if (arg === "--repeats") opts.repeats = Number(argv[++i])
    else if (arg === "--out") opts.outPath = resolve(argv[++i])
    else if (arg === "--store-base") opts.storeBase = resolve(argv[++i])
    else if (arg === "--stealth") opts.stealth = true
    else if (arg === "--proxy-country") opts.proxyCountry = argv[++i]
    else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!Number.isFinite(opts.repeats) || opts.repeats < 1) {
    throw new Error("--repeats must be a positive number")
  }
  return opts
}

function printHelp() {
  console.log(`Usage: npm run bench -- [options]

Options:
  --tasks <path>          JSON task file (default: bench/tasks.json)
  --repeats <n>           Repeats per phase/task (default: 1)
  --out <path>            Results JSON path (default: .bench/results-<timestamp>.json)
  --store-base <path>     Benchmark store directory base (default: .bench/store)
  --stealth               Use TinyFish stealth browser profile
  --proxy-country <code>  Enable TinyFish proxy with country code, e.g. US
`)
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function pctDelta(next: number, prev: number): string {
  const delta = (next - prev) * 100
  const sign = delta >= 0 ? "+" : ""
  return `${sign}${delta.toFixed(1)} pts`
}

function timeDelta(next: number, prev: number): string {
  const delta = next - prev
  const sign = delta >= 0 ? "+" : ""
  return `${sign}${(delta / 1000).toFixed(1)}s`
}

function hasBlockedError(row: BenchRow): boolean {
  return row.errors.some((err) => /\b(blocked|captcha|access denied|forbidden|403)\b/i.test(err))
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}
