import chalk from "chalk"
import { listDomains } from "../store/graph/queries.ts"

export function cmdStats(all: boolean = false) {
  const stores = listDomains()

  if (stores.length === 0) {
    console.log()
    console.log(chalk.dim("  no runs recorded yet — run: myc run <domain> \"<goal>\""))
    console.log()
    return
  }

  console.log()
  console.log(
    chalk.dim("  " + "domain".padEnd(28)) +
    chalk.dim("runs".padEnd(7)) +
    chalk.dim("success".padEnd(10)) +
    chalk.dim("hints".padEnd(7)) +
    chalk.dim("trend")
  )
  console.log(chalk.dim("  " + "─".repeat(64)))

  for (const store of stores) {
    const pct = Math.round(store.successRate * 100)
    const filled = Math.round(pct / 10)
    const bar = (pct >= 80 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red)(
      "█".repeat(filled)
    ) + chalk.dim("░".repeat(10 - filled))

    const pctStr = (pct >= 80 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red)(`${pct}%`)

    console.log(
      `  ${chalk.bold(store.domain.padEnd(28))}` +
      `${String(store.runs).padEnd(7)}` +
      `${pctStr.padEnd(18)}` +
      `${String(store.hintsCount).padEnd(7)}` +
      bar
    )
  }

  if (all) {
    const totalRuns = stores.reduce((s, x) => s + x.runs, 0)
    const totalHints = stores.reduce((s, x) => s + x.hintsCount, 0)
    const avgSuccess = Math.round(stores.reduce((s, x) => s + x.successRate, 0) / stores.length * 100)
    console.log(chalk.dim("  " + "─".repeat(64)))
    console.log(
      chalk.dim(`  total runs: ${totalRuns}  ·  total hints: ${totalHints}  ·  avg success: `) +
      (avgSuccess >= 80 ? chalk.green : avgSuccess >= 50 ? chalk.yellow : chalk.red)(`${avgSuccess}%`)
    )
  }

  console.log()
}
