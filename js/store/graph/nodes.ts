import type Database from "better-sqlite3"
import type { GraphNode, NodeType } from "./types.ts"

export function nodeId(type: NodeType, name: string): string {
  return `${type}:${name}`
}

interface NodeRow {
  id: string
  type: string
  name: string
  properties: string
  created_at: string
  updated_at: string
}

function rowToNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    type: row.type as NodeType,
    name: row.name,
    properties: JSON.parse(row.properties),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function getNode(db: Database.Database, type: NodeType, name: string): GraphNode | null {
  const row = db.prepare("SELECT * FROM nodes WHERE type = ? AND name = ?").get(type, name) as NodeRow | undefined
  return row ? rowToNode(row) : null
}

export function getNodeById(db: Database.Database, id: string): GraphNode | null {
  const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as NodeRow | undefined
  return row ? rowToNode(row) : null
}

// Idempotent insert. If a node with (type, name) exists, merges properties
// (incoming wins on collision) and bumps updated_at. Returns the node id.
export function upsertNode(
  db: Database.Database,
  type: NodeType,
  name: string,
  properties: Record<string, unknown> = {},
): string {
  const id = nodeId(type, name)
  const now = new Date().toISOString()
  const existing = getNode(db, type, name)

  if (existing) {
    const merged = { ...existing.properties, ...properties }
    db.prepare("UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(merged), now, id)
    return id
  }

  db.prepare(`INSERT INTO nodes (id, type, name, properties, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, type, name, JSON.stringify(properties), now, now)
  return id
}

export function listNodes(db: Database.Database, type: NodeType): GraphNode[] {
  const rows = db.prepare("SELECT * FROM nodes WHERE type = ? ORDER BY updated_at DESC").all(type) as NodeRow[]
  return rows.map(rowToNode)
}
