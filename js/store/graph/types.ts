export type NodeType = "Domain" | "Goal" | "Run" | "Hint" | "Pattern"

export type EdgeType =
  | "applies-to"     // Hint → Domain, Pattern → Domain (per-domain confidence on properties)
  | "pursued"        // Run → Goal
  | "targeted"       // Run → Domain
  | "derived-from"   // Hint → Run (this run produced this hint)
  | "confirmed-by"   // Hint → Run (this run re-confirmed the hint; idempotent per run)
  | "used-in"        // Hint → Run (injected during prime)
  | "supersedes"     // Hint → Hint
  | "contradicts"    // Hint → Hint
  | "generalizes"    // Pattern → Hint

export interface GraphNode {
  id: string
  type: NodeType
  name: string
  properties: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface GraphEdge {
  id: number
  source_id: string
  target_id: string
  type: EdgeType
  confidence: number
  evidence_run_id: string | null
  properties: Record<string, unknown>
  created_at: string
}

export type EmbeddingEntityType =
  | "goal"
  | "hint:note"
  | "hint:action"
  | "run_summary"
  | "error"
