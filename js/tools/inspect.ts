import chalk from "chalk"
import { domainStats, domainHints } from "../store/graph/queries.ts"

export function cmdInspect(domain: string) {
  const stats = domainStats(domain)
  const hints = stats ? domainHints(domain) : []

  if (!stats || hints.length === 0) {
    console.log()
    console.log(chalk.dim(`  no knowledge found for ${domain}`))
    console.log(chalk.dim(`  run: myc run ${domain} "<goal>" to start learning`))
    console.log()
    return
  }

  const successPct = Math.round(stats.successRate * 100)

  console.log()
  console.log(chalk.bold(`  ${domain}`))
  console.log(chalk.dim("  " + "─".repeat(54)))
  console.log(`  ${chalk.dim("runs:")}          ${stats.runs}`)
  console.log(`  ${chalk.dim("success rate:")}  ${successPct >= 80 ? chalk.green(`${successPct}%`) : successPct >= 50 ? chalk.yellow(`${successPct}%`) : chalk.red(`${successPct}%`)}`)
  console.log(`  ${chalk.dim("hints:")}         ${hints.length}`)
  console.log(`  ${chalk.dim("avg confidence:")} ${Math.round(stats.avgConfidence * 100)}%`)
  console.log(`  ${chalk.dim("updated:")}       ${stats.updated.split("T")[0]}`)
  console.log(chalk.dim("  " + "─".repeat(54)))

  const TYPE_COLOURS: Record<string, (s: string) => string> = {
    blocker:    chalk.red,
    selector:   chalk.blue,
    timing:     chalk.yellow,
    flow:       chalk.cyan,
    failure:    chalk.red,
    auth:       chalk.magenta,
    rate_limit: chalk.yellow,
  }

  const sorted = [...hints].sort((a, b) => b.confidence - a.confidence)
  for (const h of sorted) {
    const conf = Math.round(h.confidence * 100)
    const filled = Math.round(conf / 10)
    const bar = "█".repeat(filled) + chalk.dim("░".repeat(10 - filled))
    const colour = TYPE_COLOURS[h.type] ?? chalk.white
    const confStr = conf >= 80 ? chalk.green(`${conf}%`) : conf >= 60 ? chalk.yellow(`${conf}%`) : chalk.red(`${conf}%`)

    console.log()
    const source = h.source ? chalk.dim(` ${h.source}`) : ""
    const tags = h.tags?.length ? chalk.dim(` #${h.tags.join(" #")}`) : ""
    console.log(`  ${bar} ${confStr}  ${colour(`[${h.type}]`)}${source}${tags}`)
    console.log(`  ${chalk.dim("note:")}   ${h.note}`)
    console.log(`  ${chalk.dim("action:")} ${h.action}`)
    console.log(`  ${chalk.dim(`seen ${h.seen}x · last ${h.last}`)}`)
  }
  console.log()
}
