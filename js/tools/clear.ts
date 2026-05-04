import { clearDomain } from "../store/graph/queries.ts"

export function cmdClear(domain: string) {
  const cleared = clearDomain(domain)
  if (!cleared) {
    console.log(`\n  no knowledge found for ${domain} — nothing to clear\n`)
    return
  }
  console.log(`\n  cleared knowledge for ${domain}\n`)
}
