export interface MyceliumConfig {
  storePath: string
  decayDays: number
  minConfidence: number
  maxHints: number
}

const config: MyceliumConfig = {
  storePath: process.env.MYCELIUM_STORE_PATH ?? "./.mycelium",
  decayDays: 14,
  minConfidence: 0.6,
  maxHints: 10,
}

export default config
