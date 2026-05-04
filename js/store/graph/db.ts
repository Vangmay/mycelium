import Database from "better-sqlite3"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import * as sqliteVec from "sqlite-vec"
import config from "../../mycelium.config.ts"
import { getEmbedDim } from "./embeddings.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(__dirname, "schema.sql")

let _db: Database.Database | null = null

export function dbPath(): string {
  return join(config.storePath, "store.db")
}

export function openDb(): Database.Database {
  if (_db) return _db

  const path = dbPath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  sqliteVec.load(db)

  // Apply base schema (idempotent — uses IF NOT EXISTS).
  db.exec(readFileSync(SCHEMA_PATH, "utf-8"))

  // Apply the embeddings vec0 table at the dim of the configured provider.
  // Recorded in _meta so a later provider swap with a different dim can be
  // detected and warned about.
  const dim = getEmbedDim()
  const storedDim = db.prepare("SELECT value FROM _meta WHERE key = 'embed_dim'").get() as { value: string } | undefined

  if (storedDim && Number(storedDim.value) !== dim) {
    throw new Error(
      `Mycelium graph store was built with embed_dim=${storedDim.value} but current provider produces ${dim}-dim vectors. ` +
      `Drop ${path} or run \`myc migrate --reset-embeddings\` to rebuild at the new dim.`
    )
  }

  if (!storedDim) {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
      entity_type TEXT,
      entity_id TEXT,
      embedding FLOAT[${dim}],
      +text TEXT
    )`)
    db.prepare("INSERT INTO _meta (key, value) VALUES ('embed_dim', ?)").run(String(dim))
  }

  _db = db
  return db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
