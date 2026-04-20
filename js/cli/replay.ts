import chalk from "chalk"
import { readStore } from "../store/reader.ts"
import { run } from "../core/runner.ts"

export async function cmdReplay(domain: string, n: number = 5) {
  const store = readStore(domain)
  const history = store.history ?? []

  if (history.length === 0) {
    console.log()
    console.log(chalk.dim(`  no run history for ${domain} — nothing to replay`))
    console.log()
    return
  }

  // Collect unique recent goals
  const recentGoals = [...new Map(
    [...history].reverse().map(e => [e.goal, e])
  ).values()]
    .slice(0, n)
    .map(e => e.goal)

  console.log()
  console.log(chalk.bold(`  replaying ${recentGoals.length} goal${recentGoals.length > 1 ? "s" : ""} on ${domain}`))
  console.log(chalk.dim(`  knowledge store: ${store.hints.length} hints loaded`))
  console.log(chalk.dim("  " + "─".repeat(54)))
  console.log()

  const results: { goal: string; success: boolean; hintsUsed: number }[] = []

  for (let i = 0; i < recentGoals.length; i++) {
    const goal = recentGoals[i]
    console.log(chalk.dim(`  [${i + 1}/${recentGoals.length}] ${goal.slice(0, 50)}`))

    const result = await run({ url: domain, goal })

    results.push({
      goal,
      success: result.success,
      hintsUsed: result.primed.hintsLoaded,
    })

    const icon = result.success ? chalk.green("  ✓") : chalk.red("  ✗")
    const hintsStr = chalk.dim(`${result.primed.hintsLoaded} hints · +${result.recorded.hintsExtracted} new`)
    console.log(`${icon}  ${hintsStr}`)
    console.log()
  }

  // Summary
  const succeeded = results.filter(r => r.success).length
  const pct = Math.round(succeeded / results.length * 100)
  const pctStr = pct >= 80 ? chalk.green(`${pct}%`) : pct >= 50 ? chalk.yellow(`${pct}%`) : chalk.red(`${pct}%`)

  console.log(chalk.dim("  " + "─".repeat(54)))
  console.log(`  replay complete: ${pctStr} success rate  (${succeeded}/${results.length})`)
  console.log()
}
