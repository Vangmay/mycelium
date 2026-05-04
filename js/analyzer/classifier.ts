import type { Hint, HintType, RunOutcome } from "../store/types.ts"

export type WebSymptomName =
  | "login_wall"
  | "cookie_banner"
  | "captcha"
  | "rate_limited"
  | "anti_bot_block"
  | "search_fallback_worked"
  | "site_search_failed"
  | "slow_path_found"
  | "auth_required"

export interface WebSymptom {
  name: WebSymptomName
  evidence: string[]
  confidence: number
}

interface RuleHintTemplate {
  type: HintType
  note: string
  action: string
  tags: string[]
}

const SYMPTOM_TO_HINT: Record<WebSymptomName, RuleHintTemplate> = {
  login_wall: {
    type: "blocker",
    note: "Direct pages may hit a login wall",
    action: "Use public search results or alternate public pages before direct navigation",
    tags: ["login_wall"],
  },
  cookie_banner: {
    type: "blocker",
    note: "Cookie or consent banner may block interaction",
    action: "Dismiss the consent banner before continuing with page actions",
    tags: ["cookie_banner"],
  },
  captcha: {
    type: "failure",
    note: "Captcha or bot challenge may block automation",
    action: "Stop and report the block instead of retrying the same automated path",
    tags: ["captcha", "anti_bot"],
  },
  rate_limited: {
    type: "rate_limit",
    note: "Site may throttle repeated automation",
    action: "Slow down and stop on throttling instead of retrying repeatedly",
    tags: ["rate_limited"],
  },
  anti_bot_block: {
    type: "failure",
    note: "Site may block automated access",
    action: "Use a less direct public path or stop if access is blocked",
    tags: ["anti_bot"],
  },
  search_fallback_worked: {
    type: "flow",
    note: "Search engine fallback worked",
    action: "Try search results before deep site navigation",
    tags: ["search_fallback"],
  },
  site_search_failed: {
    type: "failure",
    note: "Site search may be unreliable",
    action: "Prefer external search results when site search fails",
    tags: ["site_search_failed", "search_fallback"],
  },
  slow_path_found: {
    type: "flow",
    note: "A slow run eventually found a working path",
    action: "Start with the final successful navigation path instead of repeating earlier attempts",
    tags: ["slow_path_found"],
  },
  auth_required: {
    type: "auth",
    note: "Task may require an authenticated session",
    action: "Do not invent credentials; stop when authentication is required and no session is available",
    tags: ["auth_required"],
  },
}

export interface ClassificationResult {
  symptoms: WebSymptom[]
  hints: Hint[]
}

export function classifyOutcome(outcome: RunOutcome): ClassificationResult {
  const symptoms = dedupeSymptoms([
    detectLoginWall(outcome),
    detectCookieBanner(outcome),
    detectCaptcha(outcome),
    detectRateLimit(outcome),
    detectAntiBot(outcome),
    detectSearchFallbackWorked(outcome),
    detectSiteSearchFailed(outcome),
    detectSlowPath(outcome),
    detectAuthRequired(outcome),
  ].filter((s): s is WebSymptom => s !== null))

  return {
    symptoms,
    hints: symptoms.map(symptomToHint),
  }
}

export function renderSymptoms(symptoms: WebSymptom[]): string {
  if (symptoms.length === 0) return "none"
  return symptoms
    .map((s) => `- ${s.name} (${Math.round(s.confidence * 100)}%): ${s.evidence.join("; ")}`)
    .join("\n")
}

function symptomToHint(symptom: WebSymptom): Hint {
  const template = SYMPTOM_TO_HINT[symptom.name]
  return {
    id: "",
    type: template.type,
    note: template.note,
    action: template.action,
    confidence: Math.max(0.65, symptom.confidence),
    seen: 1,
    last: new Date().toISOString().split("T")[0],
    source: "rule",
    tags: template.tags,
  }
}

function dedupeSymptoms(symptoms: WebSymptom[]): WebSymptom[] {
  const byName = new Map<WebSymptomName, WebSymptom>()
  for (const s of symptoms) {
    const existing = byName.get(s.name)
    if (!existing || s.confidence > existing.confidence) byName.set(s.name, s)
  }
  return [...byName.values()].sort((a, b) => b.confidence - a.confidence)
}

function text(outcome: RunOutcome): string {
  return [
    outcome.goal,
    outcome.steps.join("\n"),
    outcome.errors.join("\n"),
    outcome.raw,
  ].join("\n")
}

function detectLoginWall(outcome: RunOutcome): WebSymptom | null {
  if (!/\b(log ?in|sign ?in|create account|join now|login required)\b/i.test(text(outcome))) {
    return null
  }
  return {
    name: "login_wall",
    evidence: ["run mentioned login/sign-in wall"],
    confidence: 0.85,
  }
}

function detectCookieBanner(outcome: RunOutcome): WebSymptom | null {
  if (!/\b(cookie|consent|privacy preferences|accept all|reject all)\b/i.test(text(outcome))) {
    return null
  }
  return {
    name: "cookie_banner",
    evidence: ["run mentioned cookie or consent UI"],
    confidence: 0.7,
  }
}

function detectCaptcha(outcome: RunOutcome): WebSymptom | null {
  if (!/\b(captcha|recaptcha|hcaptcha|verify you are human|human verification)\b/i.test(text(outcome))) {
    return null
  }
  return {
    name: "captcha",
    evidence: ["run hit a captcha or human-verification challenge"],
    confidence: 0.9,
  }
}

function detectRateLimit(outcome: RunOutcome): WebSymptom | null {
  if (!/\b(429|too many requests|rate limit|rate limited|temporarily blocked|try again later)\b/i.test(text(outcome))) {
    return null
  }
  return {
    name: "rate_limited",
    evidence: ["run hit throttling or a retry-later response"],
    confidence: 0.9,
  }
}

function detectAntiBot(outcome: RunOutcome): WebSymptom | null {
  if (!/\b(access denied|forbidden|403|blocked|unusual traffic|automated queries|bot detection)\b/i.test(text(outcome))) {
    return null
  }
  return {
    name: "anti_bot_block",
    evidence: ["run hit access-denied or bot-detection language"],
    confidence: 0.8,
  }
}

function detectSearchFallbackWorked(outcome: RunOutcome): WebSymptom | null {
  const steps = outcome.steps.join("\n")
  if (!outcome.success || !/\b(duckduckgo|google|bing|search result|search engine)\b/i.test(steps)) {
    return null
  }
  return {
    name: "search_fallback_worked",
    evidence: ["successful run used external search results"],
    confidence: 0.75,
  }
}

function detectSiteSearchFailed(outcome: RunOutcome): WebSymptom | null {
  if (!/\b(site search|search box|search field|internal search)\b/i.test(text(outcome))) return null
  if (!/\b(no results|failed|not found|could not find|didn't find)\b/i.test(text(outcome))) return null
  return {
    name: "site_search_failed",
    evidence: ["run reported failed or empty site search"],
    confidence: 0.7,
  }
}

function detectSlowPath(outcome: RunOutcome): WebSymptom | null {
  const durationMs = outcome.durationMs ?? 0
  if (!outcome.success || durationMs < 60_000 || outcome.steps.length < 4) return null
  return {
    name: "slow_path_found",
    evidence: [`successful run took ${Math.round(durationMs / 1000)}s across ${outcome.steps.length} steps`],
    confidence: 0.65,
  }
}

function detectAuthRequired(outcome: RunOutcome): WebSymptom | null {
  if (!/\b(authentication required|auth required|requires authentication|session required|must be signed in)\b/i.test(text(outcome))) {
    return null
  }
  return {
    name: "auth_required",
    evidence: ["run explicitly required authentication or session access"],
    confidence: 0.85,
  }
}
