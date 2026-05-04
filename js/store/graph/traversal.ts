import type Database from "better-sqlite3"
import type { Hint, HintType } from "../types.ts"
import config from "../../mycelium.config.ts"
import { openDb } from "./db.ts"
import { embed, vecBuffer } from "./embeddings.ts"
import { nodeId } from "./nodes.ts"

const NEW_HINT_BASE_CONFIDENCE = 0.6
const PER_RUN_BUMP = 0.05
const MAX_CONFIDENCE = 0.99
const DECAY_HALVE_DAYS = config.decayDays
const VECTOR_RERANK_K = 20  // top-K from ANN before SQL filtering

// Hint shaping — type priority, per-type caps, drop-slow-timing rule.
const TYPE_PRIORITY: Record<string, number> = {
  flow: 0, blocker: 1, auth: 2, timing: 3, selector: 4, failure: 5, rate_limit: 6,
}
const MAX_PER_TYPE: Record<string, number> = {
  flow: 2, timing: 1, failure: 2, blocker: 1, auth: 1, selector: 1, rate_limit: 1,
}
const DELAY_WORDS = /\b(waits?|delays?|longer|pause|sleep)\b/i

interface CandidateRow {
  hint_id: string
  hintType: HintType
  note: string
  action: string
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
    const props = JSON.parse(r.props) as { hintType: HintType; note: string; action: string }
    return {
      hint_id: r.hint_id,
      hintType: props.hintType,
      note: props.note,
      action: props.action,
      confirms: r.confirms,
      last_seen: r.last_seen,
    }
  })
}

function computeConfidence(confirms: number, lastSeen: string | null): number {
  let conf = Math.min(MAX_CONFIDENCE, NEW_HINT_BASE_CONFIDENCE + PER_RUN_BUMP * confirms)
  if (lastSeen) {
    const ageDays = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > DECAY_HALVE_DAYS) conf *= 0.5
  }
  return conf
}

// Vector ANN: returns hint_ids ranked by goal similarity to either the
// hint:note or hint:action embedding. Used as a soft re-rank, not a filter.
async function vectorRerankHints(
  db: Database.Database,
  goal: string,
  hintIds: string[],
): Promise<Map<string, number>> {
  if (!goal.trim() || hintIds.length === 0) return new Map()

  const queryVec = vecBuffer(await embed(goal))
  const placeholders = hintIds.map(() => "?").join(",")

  // Search both note and action embeddings, take MIN distance per hint.
  // Cosine distance ranges [0, 2]; we convert to a score in [0, 1].
  const rows = db.prepare(`
    SELECT entity_id, MIN(distance) AS dist
    FROM embeddings
    WHERE embedding MATCH ?
      AND entity_type IN ('hint:note', 'hint:action')
      AND entity_id IN (${placeholders})
      AND k = ?
    GROUP BY entity_id
  `).all(queryVec, ...hintIds, VECTOR_RERANK_K) as { entity_id: string; dist: number }[]

  const out = new Map<string, number>()
  for (const r of rows) {
    out.set(r.entity_id, 1 - r.dist / 2)
  }
  return out
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
      confidence: computeConfidence(c.confirms, c.last_seen),
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
    (c) => c.hintType !== "timing" || !DELAY_WORDS.test(c.action),
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
  }))
}
