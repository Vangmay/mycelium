/**
 * Mycelium UI Server
 * Place this file in the root of your mycelium project, then:
 *
 *   npm install express @types/express
 *   npx tsx server.ts
 *
 * Open http://localhost:3000
 */

import 'dotenv/config'
import express from 'express'
import { readdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import config from '../js/mycelium.config.ts'
import { prime, buildGoal } from '../js/core/prime.ts'
import { record } from '../js/core/recorder.ts'
import { MOCK_ENABLED, getMockResponse } from '../js/core/mock.ts'
import type { RunOutcome } from '../js/store/types.ts'

const app = express()
app.use(express.json())
app.use(express.static('public'))

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const u = url.startsWith('http') ? new URL(url) : new URL(`https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** List all tracked domains with their full store data */
app.get('/api/domains', async (_req, res) => {
  try {
    const files = await readdir(config.storePath)
    const domains = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const raw = await readFile(join(config.storePath, f), 'utf-8')
          return JSON.parse(raw)
        })
    )
    res.json(domains)
  } catch {
    res.json([])
  }
})

/** Get a single domain store */
app.get('/api/domain/:domain', async (req, res) => {
  try {
    const raw = await readFile(join(config.storePath, `${req.params.domain}.json`), 'utf-8')
    res.json(JSON.parse(raw))
  } catch {
    res.status(404).json({ error: 'Domain not found' })
  }
})

/** Wipe a domain store */
app.delete('/api/domain/:domain', async (req, res) => {
  try {
    await unlink(join(config.storePath, `${req.params.domain}.json`))
    res.json({ ok: true })
  } catch {
    res.status(404).json({ error: 'Domain not found' })
  }
})

/**
 * Run an agent — streams SSE events:
 *   primed       { hintsLoaded: number }
 *   step         { purpose: string }
 *   agenterror   { message: string }
 *   complete     { success, data, durationMs, hintsExtracted, hintsTotal }
 *   error        { message: string }  (fatal, server-side)
 */
app.post('/api/run', async (req, res) => {
  const { url, goal } = req.body as { url: string; goal: string }

  if (!url || !goal) {
    return res.status(400).json({ error: 'url and goal are required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const emit = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const domain = extractDomain(url)

    // Step 1 — Prime: load hints from memory store
    const primed = prime(domain, goal)
    emit('primed', { hintsLoaded: primed.hintsLoaded })

    const enrichedGoal = buildGoal(goal, primed)
    const t0 = Date.now()

    let success = false
    let data: unknown = null
    let raw = ''
    const steps: string[] = []
    const errors: string[] = []

    if (MOCK_ENABLED) {
      // Mock mode: stream steps with short delays for demo effect
      const mock = getMockResponse(domain, goal)
      for (const step of mock.steps) {
        emit('step', { purpose: step })
        await new Promise(r => setTimeout(r, 350))
      }
      for (const err of mock.errors) {
        emit('agenterror', { message: err })
      }
      success = mock.success
      data = mock.data
      raw = mock.raw
      steps.push(...mock.steps)
      errors.push(...mock.errors)
    } else {
      // Live mode: proxy TinyFish SSE stream to client
      const apiKey = process.env.TINYFISH_API_KEY
      if (!apiKey) throw new Error('TINYFISH_API_KEY is not set in .env')

      const tfRes = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          url: url.startsWith('http') ? url : `https://${url}`,
          goal: enrichedGoal,
        }),
      })

      if (!tfRes.ok) {
        const body = await tfRes.text().catch(() => '')
        throw new Error(`TinyFish API error: ${tfRes.status} ${tfRes.statusText}\n${body}`)
      }

      const reader = tfRes.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        raw += chunk

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'PROGRESS' && event.purpose) {
              steps.push(event.purpose)
              emit('step', { purpose: event.purpose })
            }
            if (event.type === 'FAILED' && event.message) {
              errors.push(event.message)
              emit('agenterror', { message: event.message })
            }
            if (event.type === 'COMPLETE') {
              data = event.result ?? event.data
              success = event.status === 'COMPLETED'
            }
          } catch { /* skip non-JSON lines */ }
        }
      }
    }

    const durationMs = Date.now() - t0

    // Step 3 — Record: extract new hints from what just happened
    const outcome: RunOutcome = {
      domain,
      goal,
      success,
      steps,
      errors,
      raw: raw || JSON.stringify(data),
      durationMs,
    }
    const recorded = await record(outcome)

    emit('complete', {
      success,
      data,
      durationMs,
      hintsExtracted: recorded.hintsExtracted,
      hintsTotal: recorded.hintsTotal,
    })
  } catch (err: unknown) {
    emit('error', { message: err instanceof Error ? err.message : String(err) })
  }

  res.end()
})

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000)
app.listen(PORT, () => {
  console.log(`\n🌱 Mycelium UI  →  http://localhost:${PORT}`)
  console.log(`   mock mode    :  ${MOCK_ENABLED ? 'ON  (MYCELIUM_MOCK=1)' : 'OFF (real API calls)'}`)
  console.log(`   store path   :  ${config.storePath}\n`)
})
