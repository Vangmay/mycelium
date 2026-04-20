import chalk from "chalk";
import { readStore, applyDecay } from "../store/reader.js";
export function cmdInspect(domain) {
    const raw = readStore(domain);
    const store = applyDecay(raw);
    if (store.hints.length === 0) {
        console.log();
        console.log(chalk.dim(`  no knowledge found for ${domain}`));
        console.log(chalk.dim(`  run: myc run ${domain} "<goal>" to start learning`));
        console.log();
        return;
    }
    const avgConf = store.hints.reduce((s, h) => s + h.confidence, 0) / store.hints.length;
    const successPct = Math.round(store.successRate * 100);
    console.log();
    console.log(chalk.bold(`  ${domain}`));
    console.log(chalk.dim("  " + "─".repeat(54)));
    console.log(`  ${chalk.dim("runs:")}          ${store.runs}`);
    console.log(`  ${chalk.dim("success rate:")}  ${successPct >= 80 ? chalk.green(`${successPct}%`) : successPct >= 50 ? chalk.yellow(`${successPct}%`) : chalk.red(`${successPct}%`)}`);
    console.log(`  ${chalk.dim("hints:")}         ${store.hints.length}`);
    console.log(`  ${chalk.dim("avg confidence:")} ${Math.round(avgConf * 100)}%`);
    console.log(`  ${chalk.dim("updated:")}       ${store.updated.split("T")[0]}`);
    console.log(chalk.dim("  " + "─".repeat(54)));
    const TYPE_COLOURS = {
        blocker: chalk.red,
        selector: chalk.blue,
        timing: chalk.yellow,
        flow: chalk.cyan,
        failure: chalk.red,
        auth: chalk.magenta,
        rate_limit: chalk.yellow,
    };
    const sorted = [...store.hints].sort((a, b) => b.confidence - a.confidence);
    for (const h of sorted) {
        const conf = Math.round(h.confidence * 100);
        const filled = Math.round(conf / 10);
        const bar = "█".repeat(filled) + chalk.dim("░".repeat(10 - filled));
        const colour = TYPE_COLOURS[h.type] ?? chalk.white;
        const confStr = conf >= 80 ? chalk.green(`${conf}%`) : conf >= 60 ? chalk.yellow(`${conf}%`) : chalk.red(`${conf}%`);
        console.log();
        console.log(`  ${bar} ${confStr}  ${colour(`[${h.type}]`)}`);
        console.log(`  ${chalk.dim("note:")}   ${h.note}`);
        console.log(`  ${chalk.dim("action:")} ${h.action}`);
        console.log(`  ${chalk.dim(`seen ${h.seen}x · last ${h.last}`)}`);
    }
    console.log();
}
//# sourceMappingURL=inspect.js.map