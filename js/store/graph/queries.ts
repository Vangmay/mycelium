import { openDb } from "./db.ts"
import { nodeId } from "./nodes.ts"
import type { Hint, HintType } from "../types.ts"

export interface DomainStats {
  domain: string
  runs: number
  successRate: number
  hintsCount: number
  avgConfidence: number
  updated: string
}

export interface HistoryEntry {
  ts: string
  goal: string
  success: boolean
  hintsUsed: number
  hintsAdded: number
  durationMs?: number
}

const NEW_HINT_BASE_CONFIDENCE = 0.6
const PER_RUN_BUMP = 0.05
const MAX_CONFIDENCE = 0.99

function confFromConfirms(
  confirms: number,
  initialConfidence?: number,
  source?: Hint["source"],
): number {
  const sourceFloor = source === "manual" ? 0.95 : source === "rule" ? 0.7 : 0
  return Math.min(
    MAX_CONFIDENCE,
    Math.max(NEW_HINT_BASE_CONFIDENCE + PER_RUN_BUMP * confirms, initialConfidence ?? 0, sourceFloor),
  )
}

export function domainStats(domain: string): DomainStats | null {
  const db = openDb()
  const dId = nodeId("Domain", domain)

  const dom = db.prepare("SELECT updated_at FROM nodes WHERE id = ?").get(dId) as { updated_at: string } | undefined
  if (!dom) return null

  // Runs that targeted this domain
  const runRow = db.prepare(`
    SELECT
      COUNT(*) AS runs,
      COALESCE(AVG(CASE WHEN json_extract(n.properties, '$.success') IN (1, 'true', true) THEN 1.0 ELSE 0.0 END), 0) AS rate
    FROM nodes n
    JOIN edges e ON e.source_id = n.id AND e.type = 'targeted' AND e.target_id = ?
    WHERE n.type = 'Run'
  `).get(dId) as { runs: number; rate: number }

  // Hints applying to this domain, with confirmation counts
  const hintRows = db.prepare(`
    SELECT
      h.id AS hint_id,
      h.properties AS props,
      (SELECT COUNT(DISTINCT evidence_run_id) FROM edges
        WHERE source_id = h.id AND type = 'confirmed-by' AND evidence_run_id IS NOT NULL) AS confirms
    FROM nodes h
    WHERE h.type = 'Hint'
      AND EXISTS (
        SELECT 1 FROM edges e
        WHERE e.source_id = h.id AND e.target_id = ? AND e.type = 'applies-to'
      )
  `).all(dId) as { hint_id: string; props: string; confirms: number }[]

  const hintsCount = hintRows.length
  const avgConfidence = hintsCount === 0
    ? 0
    : hintRows.reduce((s, r) => {
        const p = JSON.parse(r.props) as { initialConfidence?: number; source?: Hint["source"] }
        return s + confFromConfirms(r.confirms, p.initialConfidence, p.source)
      }, 0) / hintsCount

  return {
    domain,
    runs: runRow.runs,
    successRate: runRow.rate,
    hintsCount,
    avgConfidence,
    updated: dom.updated_at,
  }
}

export function listDomains(): DomainStats[] {
  const db = openDb()
  const rows = db.prepare("SELECT name FROM nodes WHERE type = 'Domain' ORDER BY updated_at DESC").all() as { name: string }[]
  return rows
    .map((r) => domainStats(r.name))
    .filter((s): s is DomainStats => s !== null && s.runs > 0)
    .sort((a, b) => b.runs - a.runs)
}

export interface DomainHint extends Hint {
  // alias for the full unfiltered hint set
}

export function domainHints(domain: string): DomainHint[] {
  const db = openDb()
  const dId = nodeId("Domain", domain)
  const rows = db.prepare(`
    SELECT
      h.id AS hint_id,
      h.properties AS props,
      (SELECT COUNT(DISTINCT evidence_run_id) FROM edges
        WHERE source_id = h.id AND type = 'confirmed-by' AND evidence_run_id IS NOT NULL) AS confirms,
      (SELECT MAX(json_extract(properties, '$.lastSeen'))
        FROM edges
        WHERE source_id = h.id AND target_id = ? AND type = 'applies-to') AS last_seen
    FROM nodes h
    WHERE h.type = 'Hint'
      AND EXISTS (
        SELECT 1 FROM edges e
        WHERE e.source_id = h.id AND e.target_id = ? AND e.type = 'applies-to'
      )
  `).all(dId, dId) as { hint_id: string; props: string; confirms: number; last_seen: string | null }[]

  const today = new Date().toISOString().split("T")[0]
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
      id: r.hint_id,
      type: props.hintType,
      note: props.note,
      action: props.action,
      confidence: confFromConfirms(r.confirms, props.initialConfidence, props.source),
      seen: r.confirms,
      last: r.last_seen ?? today,
      source: props.source,
      tags: Array.isArray(props.tags) ? props.tags : [],
    }
  })
}

export function domainHistory(domain: string, limit?: number): HistoryEntry[] {
  const db = openDb()
  const dId = nodeId("Domain", domain)
  const rows = db.prepare(`
    SELECT n.id AS run_id, n.properties AS props, n.created_at
    FROM nodes n
    JOIN edges e ON e.source_id = n.id AND e.type = 'targeted' AND e.target_id = ?
    WHERE n.type = 'Run'
    ORDER BY n.created_at DESC
    ${limit ? `LIMIT ${Number(limit)}` : ""}
  `).all(dId) as { run_id: string; props: string; created_at: string }[]

  return rows.map((r) => {
    const p = JSON.parse(r.props) as {
      success?: boolean
      durationMs?: number
      goal?: string
      ts?: string
    }
    const usedCount = (db.prepare(`
      SELECT COUNT(*) AS n FROM edges
      WHERE target_id = ? AND type IN ('used-in', 'confirmed-by')
    `).get(r.run_id) as { n: number }).n
    const addedCount = (db.prepare(`
      SELECT COUNT(*) AS n FROM edges
      WHERE target_id = ? AND type = 'derived-from'
    `).get(r.run_id) as { n: number }).n
    return {
      ts: p.ts ?? r.created_at,
      goal: p.goal ?? "",
      success: Boolean(p.success),
      hintsUsed: usedCount,
      hintsAdded: addedCount,
      durationMs: p.durationMs,
    }
  })
}

// Cascade delete every node tied to this domain. Drops the Domain node, all
// Run nodes that targeted it, all Hint nodes that applied only to it (hints
// shared with other domains are kept but their applies-to edge is gone).
export function clearDomain(domain: string): boolean {
  const db = openDb()
  const dId = nodeId("Domain", domain)
  const exists = db.prepare("SELECT 1 FROM nodes WHERE id = ?").get(dId)
  if (!exists) return false

  const tx = db.transaction(() => {
    // Hints applying only to this domain (no other applies-to edges).
    const orphanHints = db.prepare(`
      SELECT h.id FROM nodes h
      WHERE h.type = 'Hint'
        AND EXISTS (SELECT 1 FROM edges WHERE source_id = h.id AND target_id = ? AND type = 'applies-to')
        AND NOT EXISTS (
          SELECT 1 FROM edges WHERE source_id = h.id AND target_id != ? AND type = 'applies-to'
        )
    `).all(dId, dId) as { id: string }[]

    // Delete embeddings for orphan hints.
    const delEmb = db.prepare("DELETE FROM embeddings WHERE entity_id = ?")
    for (const h of orphanHints) {
      delEmb.run(h.id)
    }

    // Delete the orphan hint nodes (cascade deletes their edges).
    const delNode = db.prepare("DELETE FROM nodes WHERE id = ?")
    for (const h of orphanHints) {
      delNode.run(h.id)
    }

    // Delete Run nodes that targeted this domain (cascade deletes their edges + embeddings).
    const runs = db.prepare(`
      SELECT n.id FROM nodes n
      JOIN edges e ON e.source_id = n.id AND e.type = 'targeted' AND e.target_id = ?
      WHERE n.type = 'Run'
    `).all(dId) as { id: string }[]
    for (const r of runs) {
      delEmb.run(r.id)
      // Patch / error sub-embeddings use compound entity_id "<run_id>:..."
      db.prepare("DELETE FROM embeddings WHERE entity_id LIKE ?").run(`${r.id}:%`)
      delNode.run(r.id)
    }

    // Drop the Domain node itself.
    delNode.run(dId)
  })
  tx()
  return true
}
