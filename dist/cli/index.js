#!/usr/bin/env node
import 'dotenv/config';
import { Command } from "commander";
import { cmdRun } from "./run.js";
import { cmdInspect } from "./inspect.js";
import { cmdStats } from "./stats.js";
import { cmdClear } from "./clear.js";
import { cmdHistory } from "./history.js";
import { cmdReplay } from "./replay.js";
import { cmdBatch } from "./batch.js";
const program = new Command();
program
    .name("myc")
    .description("Mycelium — self-improving memory layer for TinyFish web agents")
    .version("0.1.0");
program
    .command("run <url> <goal>")
    .description("Run an agent task with priming and auto-recording")
    .action(cmdRun);
program
    .command("inspect <domain>")
    .description("Pretty-print the knowledge file for a domain")
    .action(cmdInspect);
program
    .command("stats")
    .description("Show success rate trend per domain")
    .option("--all", "show aggregate totals across all domains")
    .action((opts) => cmdStats(opts.all));
program
    .command("history <domain>")
    .description("Show run history timeline for a domain")
    .option("-n, --limit <n>", "number of recent runs to show", "20")
    .action((domain, opts) => cmdHistory(domain, parseInt(opts.limit)));
program
    .command("replay <domain>")
    .description("Re-run recent goals for a domain against current knowledge")
    .option("-n, --runs <n>", "number of unique goals to replay", "5")
    .action((domain, opts) => cmdReplay(domain, parseInt(opts.runs)));
program
    .command("batch <file>")
    .description("Run multiple domain/goal pairs from a JSON file")
    .action(cmdBatch);
program
    .command("clear <domain>")
    .description("Wipe the knowledge file for a domain")
    .action(cmdClear);
program.parse();
//# sourceMappingURL=index.js.map