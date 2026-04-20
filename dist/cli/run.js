import chalk from "chalk";
import { run } from "../core/runner.js";
export async function cmdRun(url, goal) {
    console.log();
    console.log(chalk.bold(`  ${url}`));
    console.log(chalk.dim(`  goal: ${goal}`));
    console.log();
    try {
        const result = await run({ url, goal });
        console.log();
        if (result.success) {
            console.log(chalk.green("  ✓ success"));
        }
        else {
            console.log(chalk.red("  ✗ failed"));
        }
        if (result.data) {
            console.log(chalk.dim("  result:"));
            const lines = JSON.stringify(result.data, null, 2).split("\n");
            lines.forEach(l => console.log(chalk.cyan(`    ${l}`)));
        }
        console.log();
    }
    catch (e) {
        console.log();
        console.log(chalk.red(`  error: ${e.message}`));
        console.log();
        process.exit(1);
    }
}
//# sourceMappingURL=run.js.map