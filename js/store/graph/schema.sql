-- Mycelium graph store schema.
-- Two-table relational graph (nodes + edges) plus a sqlite-vec virtual table
-- for embeddings. Modelled on the Autopsy reference design but stripped to
-- what an embedded library needs.

CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,            -- "Type:name"
  type        TEXT NOT NULL,               -- 'Domain' | 'Goal' | 'Run' | 'Hint' | 'Pattern'
  name        TEXT NOT NULL,
  properties  TEXT NOT NULL DEFAULT '{}',  -- JSON
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (type, name)
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);

CREATE TABLE IF NOT EXISTS edges (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  confidence      REAL NOT NULL DEFAULT 1.0,
  evidence_run_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  properties      TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL,
  UNIQUE (source_id, target_id, type, evidence_run_id)
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_evidence ON edges(evidence_run_id);

-- Tracks the embedding dim the vec0 table was built with, so a provider
-- swap (different dim) is detected at startup instead of crashing on insert.
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
