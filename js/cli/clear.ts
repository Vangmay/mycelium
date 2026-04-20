import { existsSync, unlinkSync } from "fs"
import { storePath } from "../store/reader.ts"

export function cmdClear(domain: string) {
  const path = storePath(domain)

  if (!existsSync(path)) {
    console.log(`\n  no knowledge found for ${domain} — nothing to clear\n`)
    return
  }

  unlinkSync(path)
  console.log(`\n  cleared knowledge store for ${domain}\n`)
}
