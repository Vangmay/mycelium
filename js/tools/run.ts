import chalk from "chalk"
import { run } from "../core/runner.ts"
import { tinyfishAdapter } from "../adapters/tinyfish.ts"

interface RunToolOptions {
  stealth?: boolean
  proxyCountry?: string
  noPrime?: boolean
  showPrompt?: boolean
}

export async function cmdRun(url: string, goal: string, opts: RunToolOptions = {}) {
  console.log()
  console.log(chalk.bold(`  ${url}`))
  console.log(chalk.dim(`  goal: ${goal}`))
  if (opts.stealth) console.log(chalk.dim("  browser: stealth"))
  if (opts.proxyCountry) console.log(chalk.dim(`  proxy:   ${opts.proxyCountry}`))
  if (opts.noPrime) console.log(chalk.dim("  priming: disabled"))
  console.log()

  try {
    const result = await run({
      url,
      goal,
      prime: !opts.noPrime,
      showPrompt: opts.showPrompt,
      adapter: tinyfishAdapter({
        browserProfile: opts.stealth ? "stealth" : undefined,
        proxyConfig: opts.proxyCountry
          ? { enabled: true, country_code: opts.proxyCountry.toUpperCase() }
          : undefined,
      }),
    })

    console.log()
    if (result.success) {
      console.log(chalk.green("  ✓ success"))
    } else {
      console.log(chalk.red("  ✗ failed"))
    }

    if (result.errors.length > 0) {
      console.log(chalk.dim("  errors:"))
      result.errors.forEach((err) => console.log(chalk.red(`    ${err}`)))
    }

    if (result.data) {
      console.log(chalk.dim("  result:"))
      const lines = JSON.stringify(result.data, null, 2).split("\n")
      lines.forEach(l => console.log(chalk.cyan(`    ${l}`)))
    }
    console.log()
  } catch (e: any) {
    console.log()
    console.log(chalk.red(`  error: ${e.message}`))
    console.log()
    process.exit(1)
  }
}
