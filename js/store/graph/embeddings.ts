import { createHash } from "crypto"

// Provider selection. `local` is the default — runs MiniLM in-process via
// @xenova/transformers, no API key, ~80MB one-time download. `openai` is
// opt-in for users who already have a key. `stub` is the deterministic
// hash-based provider used by tests (and as a fallback if the local model
// download fails).
export type EmbedProvider = "local" | "openai" | "stub"

const LOCAL_MODEL = "Xenova/all-MiniLM-L6-v2"   // 384 dims
const LOCAL_DIM = 384
const OPENAI_MODEL = "text-embedding-3-small"   // 1536 dims
const OPENAI_DIM = 1536
const STUB_DIM = 384                             // matches local so dev/test envs share schema

export function getProvider(): EmbedProvider {
  const raw = (process.env.MYCELIUM_EMBED_PROVIDER ?? "local").toLowerCase()
  if (raw === "openai" || raw === "stub") return raw
  return "local"
}

export function getEmbedDim(): number {
  const p = getProvider()
  if (p === "openai") return OPENAI_DIM
  if (p === "stub") return STUB_DIM
  return LOCAL_DIM
}

// ---------------------------------------------------------------------------
// Stub: deterministic sha256-derived vector. Same string → same vector, so
// exact-match retrieval still works; unrelated strings cluster around cosine
// distance ~1.0. Used by tests and as a fallback.
// ---------------------------------------------------------------------------

function stubEmbed(text: string, dim: number): Float32Array {
  const digest = createHash("sha256").update(text, "utf-8").digest()
  const out = new Float32Array(dim)
  for (let i = 0; i < dim; i++) {
    out[i] = (digest[i % digest.length] - 128) / 128
  }
  return out
}

// ---------------------------------------------------------------------------
// Local: @xenova/transformers running MiniLM via ONNX. Lazy-loaded so users
// who never embed don't pay the import cost.
// ---------------------------------------------------------------------------

// Loose type — @xenova/transformers' Pipeline return is internally typed as
// Tensor, but at runtime the .data field for feature-extraction with mean
// pooling is always a Float32Array of dim LOCAL_DIM. Coerced explicitly below.
let _localPipeline: unknown = null

async function localPipeline(): Promise<(text: string, opts?: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>> {
  if (_localPipeline) return _localPipeline as never
  const { pipeline } = await import("@xenova/transformers")
  const pipe = await pipeline("feature-extraction", LOCAL_MODEL, { quantized: true })
  _localPipeline = pipe
  return pipe as never
}

async function localEmbed(text: string): Promise<Float32Array> {
  const pipe = await localPipeline()
  const out = await pipe(text, { pooling: "mean", normalize: true })
  if (out.data instanceof Float32Array) return out.data
  return Float32Array.from(out.data as ArrayLike<number>)
}

// ---------------------------------------------------------------------------
// OpenAI: opt-in via MYCELIUM_EMBED_PROVIDER=openai. Reuses OPENAI_API_KEY.
// ---------------------------------------------------------------------------

async function openaiEmbed(text: string): Promise<Float32Array> {
  const { default: OpenAI } = await import("openai")
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const resp = await client.embeddings.create({ model: OPENAI_MODEL, input: text })
  return Float32Array.from(resp.data[0].embedding)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function embed(text: string): Promise<Float32Array> {
  const provider = getProvider()
  if (provider === "stub") return stubEmbed(text, STUB_DIM)
  if (provider === "openai") return openaiEmbed(text)
  try {
    return await localEmbed(text)
  } catch (err) {
    if (process.env.MYCELIUM_DEBUG) {
      console.error("[mycelium] local embed failed, falling back to stub:", err)
    }
    return stubEmbed(text, LOCAL_DIM)
  }
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  // Most callers have <20 items per record() call; sequential is fine and
  // keeps the local pipeline's memory bounded.
  const out: Float32Array[] = []
  for (const t of texts) out.push(await embed(t))
  return out
}

// Pack a Float32Array into the byte buffer sqlite-vec expects.
export function vecBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}
