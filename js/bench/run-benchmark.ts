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

