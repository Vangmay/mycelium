// Loads .env from the JS package root and repo root (parent).
// Used by local tools and demo entry points so either .env location works.
import { config as dotenvConfig } from "dotenv"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const here = dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: resolve(here, ".env") })
dotenvConfig({ path: resolve(here, "..", ".env") })
