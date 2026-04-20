import chalk from "chalk";
import { readFileSync, existsSync } from "fs";
import { run } from "../core/runner.js";
export async function cmdBatch(filePath) {
    if (!existsSync(filePath)) {
        console.log();
        console.log(chalk.red(`  file not found: ${filePath}`));
        console.log();
        process.exit(1);
    }
    let tasks;
    try {
        tasks = JSON.parse(readFileSync(filePath, "utf-8"));
        if (!Array.isArray(tasks))
            throw new Error("expected a JSON array");
    }
    catch (e) {
        console.log();
        console.log(chalk.red(`  invalid batch file: ${e.message}`));
        console.log(chalk.dim("  expected: [{ url, goal, label? }, ...]"));
        console.log();
        process.exit(1);
    }
    console.log();
    console.log(chalk.bold(`  batch run — ${tasks.length} task${tasks.length > 1 ? "s" : ""}`));
    console.log(chalk.dim("  " + "─".repeat(60)));
    console.log();
    const results = [];
    const domainsSeen = new Set();
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const label = task.label ?? task.url;
        console.log(chalk.bold(`  [${i + 1}/${tasks.length}] ${label}`));
        console.log(chalk.dim(`  goal: ${task.goal.slice(0, 60)}`));
        try {
            const result = await run({ url: task.url, goal: task.goal });
            domainsSeen.add(result.primed.domain);
            const icon = result.success ? chalk.green("  ✓") : chalk.red("  ✗");
            console.log(`${icon} ${result.success ? chalk.green("success") : chalk.red("failed")}  ${chalk.dim(`${result.primed.hintsLoaded} hints used · +${result.recorded.hintsExtracted} learned`)}`);
            results.push({
                label,
                success: result.success,
                hintsLoaded: result.primed.hintsLoaded,
                hintsAdded: result.recorded.hintsExtracted,
            });
        }
        catch (e) {
            console.log(chalk.red(`  error: ${e.message}`));
            results.push({ label, success: false, hintsLoaded: 0, hintsAdded: 0 });
        }
        console.log();
    }
    // Summary table
    const succeeded = results.filter(r => r.success).length;
    const totalHintsAdded = results.reduce((s, r) => s + r.hintsAdded, 0);
    const pct = Math.round(succeeded / results.length * 100);
    const pctStr = pct >= 80 ? chalk.green(`${pct}%`) : pct >= 50 ? chalk.yellow(`${pct}%`) : chalk.red(`${pct}%`);
    console.log(chalk.dim("  " + "─".repeat(60)));
    console.log(chalk.bold("  batch complete"));
    console.log(`  ${chalk.dim("tasks:")}       ${tasks.length}`);
    console.log(`  ${chalk.dim("succeeded:")}   ${succeeded}  (${pctStr})`);
    console.log(`  ${chalk.dim("domains:")}     ${domainsSeen.size}`);
    console.log(`  ${chalk.dim("hints learned:")} ${totalHintsAdded}`);
    console.log();
}
//# sourceMappingURL=batch.js.map