import chalk from "chalk"
import { domainHistory } from "../store/graph/queries.ts"

export function cmdHistory(domain: string, limit: number = 20) {
  const entries = domainHistory(domain, limit)

  if (entries.length === 0) {
    console.log()
    console.log(chalk.dim(`  no run history for ${domain} yet`))
    console.log(chalk.dim(`  run: myc run ${domain} "<goal>" to start`))
    console.log()
    return
  }

  const successCount = entries.filter(e => e.success).length
  const successPct = Math.round(successCount / entries.length * 100)

  console.log()
  console.log(chalk.bold(`  ${domain}`) + chalk.dim(` — last ${entries.length} runs`))
  console.log(chalk.dim("  " + "─".repeat(60)))

  for (const entry of entries) {
    const date = entry.ts.split("T")[0]
    const time = entry.ts.split("T")[1]?.slice(0, 5) ?? ""
    const icon = entry.success ? chalk.green("✓") : chalk.red("✗")
    const hintsStr = chalk.dim(`${entry.hintsUsed} hints loaded`)
    const addedStr = entry.hintsAdded > 0
      ? chalk.green(` +${entry.hintsAdded} learned`)
      : ""
    const dur = entry.durationMs
      ? chalk.dim(` ${(entry.durationMs / 1000).toFixed(1)}s`)
      : ""

    console.log(`  ${icon}  ${chalk.dim(`${date} ${time}`)}  ${hintsStr}${addedStr}${dur}`)
    console.log(`     ${chalk.dim(entry.goal.slice(0, 60))}${entry.goal.length > 60 ? chalk.dim("…") : ""}`)
  }

  console.log(chalk.dim("  " + "─".repeat(60)))
  const pctStr = successPct >= 80 ? chalk.green(`${successPct}%`) : successPct >= 50 ? chalk.yellow(`${successPct}%`) : chalk.red(`${successPct}%`)
  console.log(`  overall success: ${pctStr}  (${successCount}/${entries.length} runs)`)
  console.log()
}
