#!/usr/bin/env node
import "../load-env.ts"
import { Command } from "commander"
import { cmdRun } from "./run.ts"
import { cmdInspect } from "./inspect.ts"
import { cmdStats } from "./stats.ts"
import { cmdClear } from "./clear.ts"
import { cmdHistory } from "./history.ts"
import { cmdReplay } from "./replay.ts"
import { cmdBatch } from "./batch.ts"

const program = new Command()

program
  .name("myc")
  .description("Mycelium — self-improving memory layer for TinyFish web agents")
  .version("0.1.0")

program
  .command("run <url> <goal>")
  .description("Run an agent task with priming and auto-recording")
  .action(cmdRun)

program
  .command("inspect <domain>")
  .description("Pretty-print the knowledge file for a domain")
  .action(cmdInspect)

program
  .command("stats")
  .description("Show success rate trend per domain")
  .option("--all", "show aggregate totals across all domains")
  .action((opts) => cmdStats(opts.all))

program
  .command("history <domain>")
  .description("Show run history timeline for a domain")
  .option("-n, --limit <n>", "number of recent runs to show", "20")
  .action((domain, opts) => cmdHistory(domain, parseInt(opts.limit)))

program
  .command("replay <domain>")
  .description("Re-run recent goals for a domain against current knowledge")
  .option("-n, --runs <n>", "number of unique goals to replay", "5")
  .action((domain, opts) => cmdReplay(domain, parseInt(opts.runs)))

program
  .command("batch <file>")
  .description("Run multiple domain/goal pairs from a JSON file")
  .action(cmdBatch)

program
  .command("clear <domain>")
  .description("Wipe the knowledge file for a domain")
  .action(cmdClear)

program.parse()
