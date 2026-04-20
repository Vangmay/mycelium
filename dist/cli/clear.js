import { existsSync, unlinkSync } from "fs";
import { storePath } from "../store/reader.js";
export function cmdClear(domain) {
    const path = storePath(domain);
    if (!existsSync(path)) {
        console.log(`\n  no knowledge found for ${domain} — nothing to clear\n`);
        return;
    }
    unlinkSync(path);
    console.log(`\n  cleared knowledge store for ${domain}\n`);
}
//# sourceMappingURL=clear.js.map