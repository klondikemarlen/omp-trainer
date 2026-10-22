import { availableCapabilities, captureWork, EVALUATION_TYPE, hasUnfinishedTodos, STATE_TYPE, textContent } from "./lib/evidence.js"
import { evaluationPrompt, recallPrompt, validateEvaluation, validateRecall } from "./lib/coaching.js"

const HINT_WIDGET = "omp-trainer.hint"

function defaultMode() {
  if (process.env.OMP_TRAINER_MODE === "quiet") return "quiet"

  return "verbose"
}

export default function trainer(pi) {
  pi.setLabel("Trainer")
  let enabled = process.env.OMP_TRAINER_ENABLED !== "0"
  let mode = defaultMode()
  let lastStatus = "Waiting for completed work"
  let stopObserved = false
  let pending
  let generation = 0

  function showHint(ctx, message, label = "Trainer hint") {
    ctx.ui.setWidget(HINT_WIDGET, `${label}: ${message}`.split("\n"), { placement: "belowEditor" })
  }

  function reportOutcome(ctx, status) {
    lastStatus = status
    if (mode === "verbose") ctx.ui.notify(`Trainer: ${status}.`, "info")
  }

  function cancel(ctx) {
    generation++
    pending?.controller.abort()
    pending = undefined
    stopObserved = false

    if (ctx.agent?.kind === "main") ctx.ui.setWidget(HINT_WIDGET, undefined)
  }

  function restore(_event, ctx) {
    cancel(ctx)
    enabled = process.env.OMP_TRAINER_ENABLED !== "0"
    mode = defaultMode()
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.customType !== STATE_TYPE) continue

      if (typeof entry.data?.enabled === "boolean") enabled = entry.data.enabled
      if (entry.data?.mode === "verbose" || entry.data?.mode === "quiet") mode = entry.data.mode
    }
    lastStatus = "Waiting for completed work"
  }

  function canRequest(ctx) {
    const jobs = ctx.getAsyncJobSnapshot?.()
    if (jobs?.running?.length || jobs?.delivery?.queued || jobs?.delivery?.delivering) return false

    return ctx.agent?.kind === "main" && ctx.hasUI && ctx.isIdle() && !ctx.hasPendingMessages()
  }

  function canEvaluate(ctx) {
    return enabled && canRequest(ctx)
  }

  async function requestAssessment(ctx, promptText) {
    if (!ctx.runEphemeralTurn) throw new Error("this OMP host has no runEphemeralTurn API")

    const expectedGeneration = generation
    const sessionId = ctx.sessionManager.getSessionId()
    const controller = new AbortController()
    const request = { controller, promptText }
    pending = request
    const deadline = ctx.setTimeout(() => controller.abort(), 45_000)
    try {
      const { replyText } = await ctx.runEphemeralTurn({
        promptText,
        tools: false,
        // Codex rejects output caps here; preserve the current route and bound time/context instead.
        maxContextBytes: 128_000,
        signal: controller.signal,
      })
      if (generation !== expectedGeneration || !canRequest(ctx)) return
      if (ctx.sessionManager.getSessionId() !== sessionId) return
      if (controller.signal.aborted) throw new Error("assessment timed out")

      return replyText
    } catch (error) {
      if (generation !== expectedGeneration) return

      throw error
    } finally {
      ctx.clearTimer(deadline)
      if (pending === request) pending = undefined
    }
  }

  async function evaluate(ctx, expectedGeneration) {
    if (generation !== expectedGeneration || !canEvaluate(ctx)) return
    if (!ctx.runEphemeralTurn) {
      reportOutcome(ctx, "Unavailable: this OMP host has no runEphemeralTurn API")
      return
    }
    const entries = ctx.sessionManager.getBranch()
    if (hasUnfinishedTodos(entries)) {
      reportOutcome(ctx, "Skipped: unfinished todos")
      return
    }
    const work = captureWork(entries)
    if (!work) {
      reportOutcome(ctx, "Skipped: no bounded completed-work candidate")
      return
    }
    if (ctx.sessionManager.getEntries().some(entry => entry.customType === EVALUATION_TYPE && entry.data?.key === work.key)) return
    const capabilities = availableCapabilities(pi)
    if (!capabilities.length) {
      reportOutcome(ctx, "Skipped: no bounded available-capability catalog")
      return
    }
    lastStatus = "Evaluating completed-work candidate"
    try {
      const replyText = await requestAssessment(ctx, evaluationPrompt(work, capabilities, mode))
      if (replyText === undefined || generation !== expectedGeneration || !canEvaluate(ctx)) return
      if (captureWork(ctx.sessionManager.getBranch())?.key !== work.key) return

      const result = validateEvaluation(replyText, work, availableCapabilities(pi), mode)
      // Metadata only: not model context. Persist before presentation for replay safety.
      pi.appendEntry(EVALUATION_TYPE, { key: work.key, completed: result.completed, shown: Boolean(result.message) })
      if (!result.completed) {
        reportOutcome(ctx, "Deferred: completion not confirmed")
        return
      }
      if (!result.message) {
        reportOutcome(ctx, "Assessed completed work: no supported coaching opportunity")
        return
      }

      showHint(ctx, result.message)
      reportOutcome(ctx, "Coaching shown below the input box")
    } catch (error) {
      if (generation === expectedGeneration) reportOutcome(ctx, `Unavailable: ${String(error?.message ?? error).slice(0, 300)}`)
    }
  }

  async function recall(ctx, request) {
    if (!request) {
      ctx.ui.notify("Usage: /trainer recall <request to find a capability for>. Nothing will be executed.", "info")
      return
    }
    if (Buffer.byteLength(request) > 8_000) {
      ctx.ui.notify("Recall skipped: request exceeds 8,000 UTF-8 bytes; nothing was truncated or executed.", "info")
      return
    }
    if (!canRequest(ctx)) {
      ctx.ui.notify("Recall skipped: wait until primary and background work are idle.", "info")
      return
    }
    cancel(ctx)
    const expectedGeneration = generation
    const capabilities = availableCapabilities(pi)
    if (!capabilities.length) {
      ctx.ui.notify("Recall skipped: no bounded available-capability catalog.", "info")
      return
    }
    lastStatus = "Finding a capability for your request"
    try {
      const replyText = await requestAssessment(ctx, recallPrompt(request, capabilities))
      if (replyText === undefined || generation !== expectedGeneration) return

      const message = validateRecall(replyText, request, availableCapabilities(pi))
      lastStatus = "Recall: no supported match"
      if (message) lastStatus = "Recall shown; nothing executed"

      showHint(ctx, message ?? "No supported capability matches without changing your intent. Nothing executed.", "Trainer recall")
    } catch (error) {
      if (generation !== expectedGeneration) return

      lastStatus = `Unavailable: ${String(error?.message ?? error).slice(0, 300)}`
      ctx.ui.notify(lastStatus, "info")
    }
  }

  pi.registerCommand("trainer", {
    description: "Post-completion coaching and capability recall: on, off, verbose, quiet, status, demo, recall",
    getArgumentCompletions: prefix => ["on", "off", "verbose", "quiet", "status", "demo", "recall"].filter(value => value.startsWith(prefix)).map(value => ({ value, label: value })),
    handler: async (args, ctx) => {
      const input = args.trim() || "status"
      const [action, request = ""] = input.split(/\s+(.*)/s)
      if (action === "recall") {
        await recall(ctx, request)
        return
      }
      if (input === "demo") {
        cancel(ctx)
        showHint(ctx, "Demo — read known files directly instead of copying their contents into chat.\nNext time: “Read alpha.txt and beta.txt, add their apple counts, and report the total. Do not edit any files.”\nExample capability: read (omp://tools/read.md). Preview only; no task was assessed.")
        lastStatus = "Demo hint shown; no task assessed"
        return
      }

      if (input !== action || !["status", "on", "off", "verbose", "quiet"].includes(action)) {
        ctx.ui.notify("Usage: /trainer on|off|verbose|quiet|status|demo|recall <request>", "info")
        return
      }
      if (action !== "status") {
        cancel(ctx)
        if (action === "on" || action === "off") {
          enabled = action === "on"
        } else {
          mode = action
        }
        pi.appendEntry(STATE_TYPE, { enabled, mode })
        if (enabled) {
          lastStatus = "Waiting for completed work"
        } else {
          lastStatus = "Disabled"
        }
      }
      let state = "off"
      if (enabled) state = "on"

      ctx.ui.notify(`Trainer 0.5.0: ${state}. ${lastStatus}. Mode: ${mode}. Use /trainer quiet for selective coaching or /trainer verbose for visible feedback. Uses the current model for bounded, tool-free side turns; never blocks or resumes work.`, "info")
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
  pi.on("agent_start", (_event, ctx) => cancel(ctx))
  pi.on("input", (event, ctx) => {
    const command = event.text?.trim()
    if (command !== "/trainer" && command !== "/trainer status") cancel(ctx)
  })
  pi.on("session_shutdown", (_event, ctx) => cancel(ctx))
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
