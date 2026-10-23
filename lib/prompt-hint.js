import { randomInt } from "node:crypto"

import { describeCapability } from "./available-capabilities.js"

const COMMON_WORDS = new Set([
  "about", "after", "also", "available", "before", "command", "commands", "could", "current",
  "directly", "existing", "from", "have", "help", "into", "only", "please", "project", "request",
  "skill", "skills", "task", "that", "their", "them", "then", "these", "they", "this", "through",
  "tool", "tools", "using", "want", "when", "where", "which", "with", "without", "would", "your",
])

function words(text) {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []
  return new Set(matches.filter(word => word.length >= 4 && !COMMON_WORDS.has(word)))
}

function summary(capability) {
  const description = capability.description.trim().split(/\r?\n/, 1)[0]
  if (description.length <= 240) return description

  return `${description.slice(0, 237).trimEnd()}...`
}

function relevance(requestWords, capability) {
  let score = 0
  for (const word of words(capability.name)) {
    if (requestWords.has(word)) score += 3
  }
  for (const word of words(summary(capability))) {
    if (requestWords.has(word)) score++
  }
  if (score < 2) return 0

  return score
}

export function promptHint(request, capabilities, verbosity, previousId) {
  if (!capabilities.length) return null

  const requestWords = words(request)
  let selected
  let bestScore = 0
  for (const capability of capabilities) {
    const score = relevance(requestWords, capability)
    if (score <= bestScore) continue

    selected = capability
    bestScore = score
  }

  let related = true
  let label = "Related feature"
  if (!selected) {
    let choices = capabilities
    if (capabilities.length > 1) choices = capabilities.filter(capability => capability.id !== previousId)

    selected = choices[randomInt(choices.length)]
    related = false
    label = "Random feature reminder"
  }

  let message = `${label}: ${describeCapability(selected)}.`
  if (verbosity === "verbose") message += `\n${summary(selected)}`

  return { capabilityId: selected.id, related, message }
}

export default promptHint
