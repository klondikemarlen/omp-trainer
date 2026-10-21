import { availableCapabilities, captureWork, EVALUATION_TYPE, hasUnfinishedTodos, STATE_TYPE, textContent } from "./lib/evidence.js"
import { evaluationPrompt, validateEvaluation } from "./lib/coaching.js"

export default function trainer(pi) {
  pi.setLabel("Trainer")
  let enabled = process.env.OMP_TRAINER_ENABLED !== "0"
  let lastStatus = "Waiting for completed work"
  let stopObserved = false
  let pending
  let generation = 0

  function cancel() {
    generation++
    pending?.controller.abort()
    pending = undefined
    stopObserved = false
  }

  function restore(_event, ctx) {
    cancel()
    enabled = process.env.OMP_TRAINER_ENABLED !== "0"
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.customType === STATE_TYPE && typeof entry.data?.enabled === "boolean") enabled = entry.data.enabled
    }
    lastStatus = "Waiting for completed work"
  }

  function canEvaluate(ctx) {
    const jobs = ctx.getAsyncJobSnapshot?.()
    if (jobs?.running?.length || jobs?.delivery?.queued || jobs?.delivery?.delivering) return false

    return enabled && ctx.agent?.kind === "main" && ctx.hasUI && ctx.isIdle() && !ctx.hasPendingMessages()
  }

  async function evaluate(ctx, expectedGeneration) {
    if (generation !== expectedGeneration || !canEvaluate(ctx)) return
    if (!ctx.runEphemeralTurn) {
      lastStatus = "Unavailable: this OMP host has no runEphemeralTurn API"
      return
    }
    const entries = ctx.sessionManager.getBranch()
    if (hasUnfinishedTodos(entries)) {
      lastStatus = "Skipped: unfinished todos"
      return
    }
    const work = captureWork(entries)
    if (!work) {
      lastStatus = "Skipped: no bounded completed-work candidate"
      return
    }
    if (ctx.sessionManager.getEntries().some(entry => entry.customType === EVALUATION_TYPE && entry.data?.key === work.key)) return
    const capabilities = availableCapabilities(pi)
    if (!capabilities.length) {
      lastStatus = "Skipped: no bounded available-capability catalog"
      return
    }
    const sessionId = ctx.sessionManager.getSessionId()
    const controller = new AbortController()
    const request = { controller, promptText: evaluationPrompt(work, capabilities) }
    pending = request
    lastStatus = "Evaluating completed-work candidate"
    const deadline = ctx.setTimeout(() => controller.abort(), 45_000)
    try {
      const { replyText } = await ctx.runEphemeralTurn({
        promptText: request.promptText,
        tools: false,
        // Codex rejects output caps here; preserve the current route and bound time/context instead.
        maxContextBytes: 128_000,
        signal: controller.signal,
      })
      if (controller.signal.aborted || generation !== expectedGeneration || !canEvaluate(ctx)) return
      if (ctx.sessionManager.getSessionId() !== sessionId) return
      if (captureWork(ctx.sessionManager.getBranch())?.key !== work.key) return

      const result = validateEvaluation(replyText, work, availableCapabilities(pi))
      // Metadata only: not model context. Persist before presentation for replay safety.
      pi.appendEntry(EVALUATION_TYPE, { key: work.key, completed: result.completed, shown: Boolean(result.message) })
      lastStatus = result.message ? "Coaching shown" : "No supported coaching opportunity"
      if (result.message) ctx.ui.notify(result.message, "info")
    } catch (error) {
      if (generation === expectedGeneration) lastStatus = `Unavailable: ${String(error?.message ?? error).slice(0, 300)}`
    } finally {
      ctx.clearTimer(deadline)
      if (pending === request) pending = undefined
    }
  }

  pi.registerCommand("trainer", {
    description: "Control non-blocking post-completion coaching: on, off, status",
    getArgumentCompletions: prefix => ["on", "off", "status"].filter(value => value.startsWith(prefix)).map(value => ({ value, label: value })),
    handler: async (args, ctx) => {
      const action = args.trim() || "status"
      if (action !== "status" && action !== "on" && action !== "off") {
        ctx.ui.notify("Usage: /trainer on|off|status", "info")
        return
      }
      if (action === "on" || action === "off") {
        cancel()
        enabled = action === "on"
        pi.appendEntry(STATE_TYPE, { enabled })
        lastStatus = enabled ? "Waiting for completed work" : "Disabled"
      }
      ctx.ui.notify(`Trainer 0.1.0: ${enabled ? "on" : "off"}. ${lastStatus}. Uses the current model for bounded, tool-free side turns; never blocks or resumes work.`, "info")
    },
  })

  pi.on("context", event => {
    if (!pending || pending.controller.signal.aborted) return

    const prompt = event.messages.at(-1)
    if (prompt?.role !== "user" || textContent(prompt.content) !== pending.promptText) return

    // Only our exact side request: keep unrelated history out of its byte budget.
    return { messages: [prompt] }
  })

  for (const event of ["session_start", "session_switch", "session_branch", "session_tree"]) pi.on(event, restore)
  pi.on("agent_start", cancel)
  pi.on("input", event => {
    if (event.text?.trim() !== "/trainer status") cancel()
  })
  pi.on("session_shutdown", cancel)
  // Observe this boundary synchronously; never return a stop decision or await coaching here.
  pi.on("session_stop", (_event, ctx) => {
    if (ctx.agent?.kind === "main") stopObserved = true
  })
  pi.on("agent_end", (_event, ctx) => {
    if (!stopObserved || pending) return
    stopObserved = false
    const expectedGeneration = generation
    ctx.setTimeout(() => evaluate(ctx, expectedGeneration), 50)
  })
}
