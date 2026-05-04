import type Database from "better-sqlite3"
import type { Hint, HintType } from "../types.ts"
import config from "../../mycelium.config.ts"
import { openDb } from "./db.ts"
import { embed } from "./embeddings.ts"
import { nodeId } from "./nodes.ts"

const NEW_HINT_BASE_CONFIDENCE = 0.6
const PER_RUN_BUMP = 0.05
const MAX_CONFIDENCE = 0.99
const DECAY_HALVE_DAYS = config.decayDays
// Hint shaping — type priority, per-type caps, drop-slow-timing rule.
const TYPE_PRIORITY: Record<string, number> = {
  flow: 0, blocker: 1, auth: 2, timing: 3, selector: 4, failure: 5, rate_limit: 6,
}
const MAX_PER_TYPE: Record<string, number> = {
  flow: 2, timing: 1, failure: 2, blocker: 1, auth: 1, selector: 1, rate_limit: 1,
}
const DELAY_WORDS = /\b(waits?|delays?|longer|pause|sleep)\b/i
const GENERIC_SLOW_PATH_WORDS = /\bfinal successful navigation path\b/i
const GENERIC_ANTI_BOT_WORDS = /\b(blocked|automated access|bot)\b/i

interface CandidateRow {
  hint_id: string
  hintType: HintType
  note: string
  action: string
  source: Hint["source"]
  tags: string[]
  initialConfidence: number | null
  confirms: number       // count of distinct confirmed-by evidence runs
  last_seen: string | null  // most recent applies-to edge last_seen for this domain
}

// Fetch every hint that applies to the given domain, with the data needed
// to compute current confidence in TS.
function fetchHintsForDomain(db: Database.Database, domain: string): CandidateRow[] {
  const domainId = nodeId("Domain", domain)
  const rows = db.prepare(`
    SELECT
      h.id   AS hint_id,
      h.properties AS props,
      (SELECT COUNT(DISTINCT evidence_run_id)
         FROM edges
         WHERE source_id = h.id AND type = 'confirmed-by'
           AND evidence_run_id IS NOT NULL) AS confirms,
      (SELECT MAX(json_extract(properties, '$.lastSeen'))
         FROM edges
         WHERE source_id = h.id AND target_id = ? AND type = 'applies-to') AS last_seen
    FROM nodes h
    WHERE h.type = 'Hint'
      AND EXISTS (
        SELECT 1 FROM edges e
        WHERE e.source_id = h.id AND e.target_id = ? AND e.type = 'applies-to'
      )
  `).all(domainId, domainId) as { hint_id: string; props: string; confirms: number; last_seen: string | null }[]

  return rows.map((r) => {
    const props = JSON.parse(r.props) as {
      hintType: HintType
      note: string
      action: string
      source?: Hint["source"]
      tags?: string[]
      initialConfidence?: number
    }
    return {
      hint_id: r.hint_id,
      hintType: props.hintType,
      note: props.note,
      action: props.action,
      source: props.source,
      tags: Array.isArray(props.tags) ? props.tags : [],
      initialConfidence: typeof props.initialConfidence === "number" ? props.initialConfidence : null,
      confirms: r.confirms,
      last_seen: r.last_seen,
    }
  })
}

function computeConfidence(
  confirms: number,
  lastSeen: string | null,
  initialConfidence: number | null,
  source: Hint["source"],
): number {
  const sourceFloor = source === "manual" ? 0.95 : source === "rule" ? 0.7 : 0
  let conf = Math.min(
    MAX_CONFIDENCE,
    Math.max(
      NEW_HINT_BASE_CONFIDENCE + PER_RUN_BUMP * confirms,
      initialConfidence ?? 0,
      sourceFloor,
    ),
  )
  if (lastSeen) {
    const ageDays = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > DECAY_HALVE_DAYS) conf *= 0.5
  }
  return conf
}

// Vector rerank: returns hint_ids ranked by goal similarity to either the
// hint:note or hint:action embedding. We compute this in-process over the
// already-filtered candidate IDs. Domain hint sets are small, and this avoids
// sqlite-vec KNN limitations around GROUP BY / MIN(distance).
async function vectorRerankHints(
  db: Database.Database,
  goal: string,
  hintIds: string[],
): Promise<Map<string, number>> {
  if (!goal.trim() || hintIds.length === 0) return new Map()

  const queryVec = await embed(goal)
  const placeholders = hintIds.map(() => "?").join(",")

  const rows = db.prepare(`
    SELECT entity_id, embedding
    FROM embeddings
    WHERE entity_type IN ('hint:note', 'hint:action')
      AND entity_id IN (${placeholders})
  `).all(...hintIds) as { entity_id: string; embedding: Buffer }[]

  const out = new Map<string, number>()
  for (const r of rows) {
    const score = cosineScore(queryVec, float32FromBuffer(r.embedding))
    out.set(r.entity_id, Math.max(out.get(r.entity_id) ?? 0, score))
  }
  return out
}

function float32FromBuffer(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / Float32Array.BYTES_PER_ELEMENT)
}

function cosineScore(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  const cosine = dot / (Math.sqrt(na) * Math.sqrt(nb))
  return Math.max(0, Math.min(1, (cosine + 1) / 2))
}

export interface PrimeFromGraphArgs {
  domain: string
  goal?: string
}

// Main read path: hints to inject, after confidence/decay/dedup/shaping.
export async function primeFromGraph(args: PrimeFromGraphArgs): Promise<Hint[]> {
  const { domain, goal } = args
  const db = openDb()

  const candidates = fetchHintsForDomain(db, domain)
  if (candidates.length === 0) return []

  // Compute confidence + apply minConfidence filter.
  const scored = candidates
    .map((c) => ({
      ...c,
      confidence: computeConfidence(c.confirms, c.last_seen, c.initialConfidence, c.source),
    }))
    .filter((c) => c.confidence >= config.minConfidence)

  // Optional vector re-rank by goal similarity. Failures here (e.g. local
  // model not yet downloaded) shouldn't break prime() — fall back to plain
  // confidence ordering.
  let semScores = new Map<string, number>()
  if (goal && scored.length > 0) {
    try {
      semScores = await vectorRerankHints(db, goal, scored.map((c) => c.hint_id))
    } catch (err) {
      if (process.env.MYCELIUM_DEBUG) console.error("[mycelium] vector rerank failed:", err)
    }
  }

  // Drop slow timing hints (existing JSON-store rule).
  const filtered = scored.filter(
    (c) => {
      if (c.hintType === "failure") return false
      if (c.hintType === "timing" && DELAY_WORDS.test(c.action)) return false
      if (c.tags.includes("slow_path_found") && GENERIC_SLOW_PATH_WORDS.test(c.action)) return false
      if (c.tags.includes("anti_bot") && GENERIC_ANTI_BOT_WORDS.test(`${c.note} ${c.action}`)) return false
      return true
    },
  )

  // Per-type cap.
  const byType = new Map<string, typeof filtered>()
  for (const c of filtered) {
    const bucket = byType.get(c.hintType) ?? []
    bucket.push(c)
    byType.set(c.hintType, bucket)
  }

  const finalScored: { hint: typeof filtered[0]; score: number }[] = []
  for (const [type, bucket] of byType) {
    const limit = MAX_PER_TYPE[type] ?? 1
    bucket
      .map((c) => ({ hint: c, score: c.confidence + (semScores.get(c.hint_id) ?? 0) * 0.2 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .forEach((entry) => finalScored.push(entry))
  }

  // Sort by type priority then score, cap to maxHints.
  finalScored.sort((a, b) => {
    const pa = TYPE_PRIORITY[a.hint.hintType] ?? 99
    const pb = TYPE_PRIORITY[b.hint.hintType] ?? 99
    return pa !== pb ? pa - pb : b.score - a.score
  })

  const today = new Date().toISOString().split("T")[0]
  return finalScored.slice(0, config.maxHints).map(({ hint }) => ({
    id: hint.hint_id,
    type: hint.hintType,
    note: hint.note,
    action: hint.action,
    confidence: hint.confidence,
    seen: hint.confirms,
    last: hint.last_seen ?? today,
    source: hint.source,
    tags: hint.tags,
  }))
}
