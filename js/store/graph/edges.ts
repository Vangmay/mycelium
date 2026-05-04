import type Database from "better-sqlite3"
import type { EdgeType, GraphEdge } from "./types.ts"

interface EdgeRow {
  id: number
  source_id: string
  target_id: string
  type: string
  confidence: number
  evidence_run_id: string | null
  properties: string
  created_at: string
}

function rowToEdge(row: EdgeRow): GraphEdge {
  return {
    id: row.id,
    source_id: row.source_id,
    target_id: row.target_id,
    type: row.type as EdgeType,
    confidence: row.confidence,
    evidence_run_id: row.evidence_run_id,
    properties: JSON.parse(row.properties),
    created_at: row.created_at,
  }
}

export interface AddEdgeArgs {
  source_id: string
  target_id: string
  type: EdgeType
  confidence?: number
  evidence_run_id?: string | null
  properties?: Record<string, unknown>
}

// Idempotent on (source_id, target_id, type, evidence_run_id). Re-adding the
// same edge with new properties merges them; same with confidence (max wins).
// Returns the edge id.
export function addEdge(db: Database.Database, args: AddEdgeArgs): number {
  const {
    source_id,
    target_id,
    type,
    confidence = 1.0,
    evidence_run_id = null,
    properties = {},
  } = args
  const now = new Date().toISOString()

  const existing = db.prepare(`
    SELECT * FROM edges
    WHERE source_id = ? AND target_id = ? AND type = ?
      AND (evidence_run_id IS ? OR evidence_run_id = ?)
  `).get(source_id, target_id, type, evidence_run_id, evidence_run_id) as EdgeRow | undefined

  if (existing) {
    const merged = { ...JSON.parse(existing.properties), ...properties }
    const newConf = Math.max(existing.confidence, confidence)
    db.prepare("UPDATE edges SET confidence = ?, properties = ? WHERE id = ?")
      .run(newConf, JSON.stringify(merged), existing.id)
    return existing.id
  }

  const result = db.prepare(`
    INSERT INTO edges (source_id, target_id, type, confidence, evidence_run_id, properties, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(source_id, target_id, type, confidence, evidence_run_id, JSON.stringify(properties), now)

  return Number(result.lastInsertRowid)
}

export function edgesFrom(
  db: Database.Database,
  source_id: string,
  type?: EdgeType,
): GraphEdge[] {
  const rows = type
    ? db.prepare("SELECT * FROM edges WHERE source_id = ? AND type = ?").all(source_id, type) as EdgeRow[]
    : db.prepare("SELECT * FROM edges WHERE source_id = ?").all(source_id) as EdgeRow[]
  return rows.map(rowToEdge)
}

export function edgesTo(
  db: Database.Database,
  target_id: string,
  type?: EdgeType,
): GraphEdge[] {
  const rows = type
    ? db.prepare("SELECT * FROM edges WHERE target_id = ? AND type = ?").all(target_id, type) as EdgeRow[]
    : db.prepare("SELECT * FROM edges WHERE target_id = ?").all(target_id) as EdgeRow[]
  return rows.map(rowToEdge)
}

// Count distinct evidence_run_id for a (source, type) pair — used to derive
// hint confidence from confirmation history.
export function countEvidenceRuns(
  db: Database.Database,
  source_id: string,
  type: EdgeType,
): number {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT evidence_run_id) AS n
    FROM edges
    WHERE source_id = ? AND type = ? AND evidence_run_id IS NOT NULL
  `).get(source_id, type) as { n: number }
  return row.n
}
