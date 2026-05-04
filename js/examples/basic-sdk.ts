// Mycelium — basic SDK usage with the TinyFish adapter
// npm install mycelium
// Copy .env.example to .env and fill in your keys, then:
// npx tsx examples/basic-sdk.ts

import 'dotenv/config'
import { run, tinyfishAdapter } from "../index.ts"

async function main() {
  const result = await run({
    url: "amazon.com",
    goal: "find the price of Kindle Paperwhite 16GB",
    adapter: tinyfishAdapter(),
  })

  console.log("data:", result.data)
  console.log("hints loaded this run:", result.primed.hintsLoaded)
  console.log("hints saved this run:", result.recorded.hintsExtracted)
  console.log("total hints stored:", result.recorded.hintsTotal)
}

main()
