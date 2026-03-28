// Mycelium — basic SDK usage
// npm install mycelium
// Copy .env.example to .env and fill in your keys, then:
// npx tsx examples/basic-sdk.ts

import 'dotenv/config'
import { run } from "../index.ts"

async function main() {
  // Drop-in replacement for a direct TinyFish call.
  const result = await run({
    url: "amazon.com",
    goal: "find the price of Kindle Paperwhite 16GB",
  })

  console.log("data:", result.data)
  console.log("hints loaded this run:", result.primed.hintsLoaded)
  console.log("hints saved this run:", result.recorded.hintsExtracted)
  console.log("total hints stored:", result.recorded.hintsTotal)
}

main()
