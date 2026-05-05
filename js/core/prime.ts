import { primeFromGraph } from "../store/graph/traversal.ts";
import type { Hint } from "../store/types.ts";

export interface PrimeResult {
  domain: string;
  hintsLoaded: number;
  hintsUsedIds: string[];
  promptBlock: string;
}

export async function prime(
  domain: string,
  goal?: string,
): Promise<PrimeResult> {
  const hints = await primeFromGraph({ domain, goal });

  if (hints.length === 0) {
    return { domain, hintsLoaded: 0, hintsUsedIds: [], promptBlock: "" };
  }

  const lines = hints.map(formatHint);
  const promptBlock = [
    `PAST OBSERVATIONS FOR ${domain}:`,
    ...lines,
    "",
  ].join("\n");

  return {
    domain,
    hintsLoaded: hints.length,
    hintsUsedIds: hints.map((h) => h.id),
    promptBlock,
  };
}

function formatHint(h: Hint): string {
  const rendered = renderAgentSafeHint(h);
  return `- ${rendered.note}. ${rendered.action}.`;
}

function renderAgentSafeHint(h: Hint): { note: string; action: string } {
  if (h.tags?.includes("login_wall")) {
    return {
      note: "Public search results are often a better entry point",
      action:
        "Start from a public search result for the requested content before opening the target page",
    };
  }
  if (h.tags?.includes("anti_bot") || h.tags?.includes("captcha")) {
    return {
      note: "Public search results are often a better entry point",
      action:
        "Use public search results or other public entry points before opening the target page",
    };
  }
  if (h.tags?.includes("rate_limited")) {
    return {
      note: "Public cached or search result pages may be more reliable",
      action:
        "Space out requests and prefer public search results or cached public pages",
    };
  }
  if (h.tags?.includes("auth_required")) {
    return {
      note: "Public pages are preferable when no session is available",
      action:
        "Use public pages and search result snippets when no authenticated session is available",
    };
  }
  return { note: h.note, action: h.action };
}

const GUIDANCE_RULES = `Use these observations only as optional context. Complete the task using the simplest public route that works.`;

export function buildGoal(
  originalGoal: string,
  primeResult: PrimeResult,
): string {
  if (!primeResult.promptBlock) return originalGoal;
  return `TASK:\n${originalGoal}\n\n${primeResult.promptBlock}${GUIDANCE_RULES}`;
}
