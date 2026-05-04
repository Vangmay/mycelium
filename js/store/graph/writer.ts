import { createHash, randomUUID } from "crypto"
import type Database from "better-sqlite3"
import type { Hint, RunOutcome } from "../types.ts"
import type { EmbeddingEntityType } from "./types.ts"
import { openDb } from "./db.ts"
import { upsertNode, nodeId } from "./nodes.ts"
import { addEdge } from "./edges.ts"
import { embedBatch, vecBuffer } from "./embeddings.ts"

// Hash to dedupe similar hints across runs. Same type + same first 80 chars
// of normalized note → same Hint node, so re-extracted hints accumulate
// `confirmed-by` edges instead of forking into duplicates.
function hintKey(type: string, note: string): string {
  const normalized = note.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80)
  return createHash("sha1").update(`${type}::${normalized}`).digest("hex").slice(0, 12)
}

function goalKey(goal: string): string {
  const normalized = goal.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120)
  return createHash("sha1").update(normalized).digest("hex").slice(0, 12)
}

// Cap on patch / error embeddings per run (mirrors autopsy). Stops one noisy
// run from blowing up the embeddings table.
const MAX_ERROR_EMBEDS = 5

export interface RecordToGraphArgs {
  outcome: RunOutcome
  hints: Hint[]              // new hints extracted by recorder.ts
  hintsUsedIds?: string[]    // ids of Hint nodes that were injected during prime()
}

export interface RecordToGraphResult {
  runId: string
  hintsAdded: number          // hints that didn't already exist as nodes
  hintsConfirmed: number      // existing hints that got a new confirmed-by edge
}

// Materialize a run + its extracted hints into the graph. Embeddings get
// computed for goal text, run summary, hint notes/actions, and errors so
// future prime() calls can match by semantic similarity.
export async function recordToGraph(args: RecordToGraphArgs): Promise<RecordToGraphResult> {
  const { outcome, hints, hintsUsedIds = [] } = args
  const db = openDb()

  const domainId = upsertNode(db, "Domain", outcome.domain, { lastSeen: new Date().toISOString() })
  const gKey = goalKey(outcome.goal)
  const goalNodeId = upsertNode(db, "Goal", gKey, { text: outcome.goal })

  const runName = randomUUID().slice(0, 12)
  const runIdFull = upsertNode(db, "Run", runName, {
    success: outcome.success,
    durationMs: outcome.durationMs,
    steps: outcome.steps,
    errors: outcome.errors,
    goal: outcome.goal,
    domain: outcome.domain,
    ts: new Date().toISOString(),
  })

  addEdge(db, { source_id: runIdFull, target_id: goalNodeId, type: "pursued" })
  addEdge(db, { source_id: runIdFull, target_id: domainId, type: "targeted" })

  // Track hints that were injected during prime() but didn't reappear in
  // this run's extraction — they were `used-in` but not `confirmed-by`.
  const newOrConfirmed = new Set<string>()
  let hintsAdded = 0
  let hintsConfirmed = 0

  for (const h of hints) {
    const key = hintKey(h.type, h.note)
    const existed = db.prepare("SELECT 1 FROM nodes WHERE type = 'Hint' AND name = ?").get(key)
    const hintNodeId = upsertNode(db, "Hint", key, {
      hintType: h.type,
      note: h.note,
      action: h.action,
    })

    if (!existed) {
      hintsAdded++
      addEdge(db, {
        source_id: hintNodeId,
        target_id: runIdFull,
        type: "derived-from",
        evidence_run_id: runIdFull,
      })
    } else {
      hintsConfirmed++
    }

    addEdge(db, {
      source_id: hintNodeId,
      target_id: runIdFull,
      type: "confirmed-by",
      evidence_run_id: runIdFull,
    })
    addEdge(db, {
      source_id: hintNodeId,
      target_id: domainId,
      type: "applies-to",
      evidence_run_id: runIdFull,
      properties: { lastSeen: new Date().toISOString().split("T")[0] },
    })

    newOrConfirmed.add(hintNodeId)
  }

  // Hints injected during prime but NOT confirmed in this run — record the
  // injection so we can later compute "used-but-unconfirmed" rates.
  for (const usedId of hintsUsedIds) {
    if (!newOrConfirmed.has(usedId)) {
      addEdge(db, {
        source_id: usedId,
        target_id: runIdFull,
        type: "used-in",
        evidence_run_id: runIdFull,
      })
    }
  }

  await writeEmbeddings(db, runIdFull, goalNodeId, outcome, hints)

  return { runId: runIdFull, hintsAdded, hintsConfirmed }
}

interface EmbedItem {
  entity_type: EmbeddingEntityType
  entity_id: string
  text: string
}

async function writeEmbeddings(
  db: Database.Database,
  runId: string,
  goalId: string,
  outcome: RunOutcome,
  hints: Hint[],
): Promise<void> {
  const items: EmbedItem[] = []

  if (outcome.goal.trim()) {
    items.push({ entity_type: "goal", entity_id: goalId, text: outcome.goal })
  }

  const summary = [
    outcome.goal,
    outcome.success ? "succeeded" : "failed",
    outcome.steps.slice(0, 5).join(" → "),
  ].filter(Boolean).join(" | ")
  if (summary.trim()) {
    items.push({ entity_type: "run_summary", entity_id: runId, text: summary })
  }

  for (const h of hints) {
    const key = hintKey(h.type, h.note)
    const hId = nodeId("Hint", key)
    if (h.note?.trim()) items.push({ entity_type: "hint:note", entity_id: hId, text: h.note })
    if (h.action?.trim()) items.push({ entity_type: "hint:action", entity_id: hId, text: h.action })
  }

  outcome.errors.slice(0, MAX_ERROR_EMBEDS).forEach((err, i) => {
    if (err?.trim()) {
      items.push({ entity_type: "error", entity_id: `${runId}:err:${i}`, text: err.slice(0, 800) })
    }
  })

  if (items.length === 0) return

  const vecs = await embedBatch(items.map((it) => it.text))

  // Upsert: vec0 doesn't enforce UNIQUE, so we delete then insert.
  const del = db.prepare("DELETE FROM embeddings WHERE entity_type = ? AND entity_id = ?")
  const ins = db.prepare(
    "INSERT INTO embeddings (entity_type, entity_id, embedding, text) VALUES (?, ?, ?, ?)",
  )

  const tx = db.transaction((rows: EmbedItem[], buffers: Buffer[]) => {
    for (let i = 0; i < rows.length; i++) {
      del.run(rows[i].entity_type, rows[i].entity_id)
      ins.run(rows[i].entity_type, rows[i].entity_id, buffers[i], rows[i].text)
    }
  })
  tx(items, vecs.map(vecBuffer))
}
