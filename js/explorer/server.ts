#!/usr/bin/env tsx
import "../load-env.ts"
import express from "express"
import { existsSync, readdirSync, readFileSync } from "fs"
import { basename, dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { buildGoal, prime } from "../core/prime.ts"
import { dbPath, openDb } from "../store/graph/db.ts"
import {
  domainHints,
  domainHistory,
  domainStats,
  listDomains,
} from "../store/graph/queries.ts"
import { nodeId } from "../store/graph/nodes.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = firstExisting([
  join(__dirname, "public"),
  join(__dirname, "../../explorer/public"),
])

interface ExplorerOptions {
  port: number
  host: string
  benchDir: string
}

const opts = parseArgs(process.argv.slice(2))
const app = express()

app.use(express.json())
app.use(express.static(publicDir))

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    storePath: dbPath(),
    benchDir: opts.benchDir,
  })
})

app.get("/api/domains", (_req, res) => {
  res.json(listDomains())
})

app.get("/api/domain/:domain", (req, res) => {
  const domain = req.params.domain
  const stats = domainStats(domain)
  if (!stats) return res.status(404).json({ error: "domain not found" })

  res.json({
    stats,
    hints: domainHints(domain),
    history: domainHistory(domain, 100),
    patterns: domainPatterns(domain),
    runs: domainRuns(domain),
  })
})

app.get("/api/graph", (_req, res) => {
  const db = openDb()
  const nodes = db.prepare("SELECT * FROM nodes ORDER BY type, updated_at DESC").all() as any[]
  const edges = db.prepare("SELECT * FROM edges ORDER BY created_at DESC").all() as any[]
  res.json({
    nodes: nodes.map((n) => ({ ...n, properties: parseJson(n.properties) })),
    edges: edges.map((e) => ({ ...e, properties: parseJson(e.properties) })),
  })
})

app.get("/api/prompt-preview", async (req, res) => {
  const domain = String(req.query.domain ?? "")
  const goal = String(req.query.goal ?? "")
  if (!domain || !goal) {
    return res.status(400).json({ error: "domain and goal are required" })
  }

  const primed = await prime(domain, goal)
  res.json({
    domain,
    goal,
    primed,
    prompt: buildGoal(goal, primed),
  })
})

app.get("/api/bench/results", (_req, res) => {
  if (!existsSync(opts.benchDir)) return res.json([])
  const files = readdirSync(opts.benchDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
  res.json(files.map((file) => {
    const path = join(opts.benchDir, file)
    const raw = readFileSync(path, "utf-8")
    const parsed = parseJson(raw)
    return {
      file,
      path,
      ts: parsed?.ts ?? null,
      flags: Array.isArray(parsed?.regressionFlags) ? parsed.regressionFlags.length : 0,
      rows: Array.isArray(parsed?.rows) ? parsed.rows.length : 0,
    }
  }))
})

app.get("/api/bench/results/:file", (req, res) => {
  const file = basename(req.params.file)
  const path = join(opts.benchDir, file)
  if (!existsSync(path)) return res.status(404).json({ error: "benchmark result not found" })
  res.type("json").send(readFileSync(path, "utf-8"))
})

app.use((_req, res) => {
  res.sendFile(join(publicDir, "index.html"))
})

app.listen(opts.port, opts.host, () => {
  console.log()
  console.log(`Mycelium Explorer -> http://${opts.host}:${opts.port}`)
  console.log(`store: ${dbPath()}`)
  console.log(`bench: ${opts.benchDir}`)
  console.log()
})

function domainPatterns(domain: string) {
  const db = openDb()
  const dId = nodeId("Domain", domain)
  const rows = db.prepare(`
    SELECT p.id, p.name, p.properties,
      COUNT(DISTINCT gh.target_id) AS hints,
      COUNT(DISTINCT ad.evidence_run_id) AS evidenceRuns,
      MAX(json_extract(ad.properties, '$.lastSeen')) AS lastSeen
    FROM nodes p
    JOIN edges ad ON ad.source_id = p.id AND ad.target_id = ? AND ad.type = 'applies-to'
    LEFT JOIN edges gh ON gh.source_id = p.id AND gh.type = 'generalizes'
    WHERE p.type = 'Pattern'
    GROUP BY p.id, p.name, p.properties
    ORDER BY evidenceRuns DESC, p.name
  `).all(dId) as any[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    properties: parseJson(r.properties),
    hints: Number(r.hints ?? 0),
    evidenceRuns: Number(r.evidenceRuns ?? 0),
    lastSeen: r.lastSeen,
  }))
}

function domainRuns(domain: string) {
  const db = openDb()
  const dId = nodeId("Domain", domain)
  const rows = db.prepare(`
    SELECT n.id, n.name, n.properties, n.created_at, n.updated_at
    FROM nodes n
    JOIN edges e ON e.source_id = n.id AND e.target_id = ? AND e.type = 'targeted'
    WHERE n.type = 'Run'
    ORDER BY n.created_at DESC
    LIMIT 100
  `).all(dId) as any[]

  const hintEdges = db.prepare(`
    SELECT e.source_id, e.type
    FROM edges e
    WHERE e.target_id = ?
      AND e.type IN ('used-in', 'confirmed-by', 'derived-from')
  `)

  return rows.map((r) => {
    const props = parseJson(r.properties) ?? {}
    const edges = hintEdges.all(r.id) as { source_id: string; type: string }[]
    return {
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      updated_at: r.updated_at,
      properties: props,
      hintsUsed: edges.filter((e) => e.type === "used-in" || e.type === "confirmed-by").length,
      hintsLearned: edges.filter((e) => e.type === "derived-from").length,
    }
  })
}

function parseJson(raw: unknown): any {
  if (typeof raw !== "string") return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function firstExisting(paths: string[]) {
  for (const path of paths) {
    if (existsSync(path)) return path
  }
  return paths[0]
}

function parseArgs(argv: string[]): ExplorerOptions {
  const out: ExplorerOptions = {
    port: Number(process.env.PORT ?? 3333),
    host: "127.0.0.1",
    benchDir: resolve(".bench"),
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--port") out.port = Number(argv[++i])
    else if (arg === "--host") out.host = argv[++i]
    else if (arg === "--bench") out.benchDir = resolve(argv[++i])
    else if (arg === "--store") process.env.MYCELIUM_STORE_PATH = dirname(resolve(argv[++i]))
    else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return out
}

function printHelp() {
  console.log(`Usage: npm run explorer -- [options]

Options:
  --port <n>       Port to bind (default: 3333)
  --host <host>    Host to bind (default: 127.0.0.1)
  --store <path>   Path to store.db. Sets MYCELIUM_STORE_PATH to the parent dir.
  --bench <path>   Directory containing benchmark result JSON files (default: .bench)
`)
}
