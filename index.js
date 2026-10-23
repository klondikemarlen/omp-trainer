import { availableCapabilities } from "./lib/available-capabilities.js"
import { promptHint } from "./lib/prompt-hint.js"
import { recallPrompt, validateRecall } from "./lib/recall-prompt.js"
import { renderHintCard } from "./lib/render-hint-card.js"
import { readVerbosity, writeVerbosity } from "./lib/settings.js"

// Status rows sort by key; keep the card after instance, project-time, and worktree statuses.
const HINT_STATUS_PREFIX = "zz-omp-trainer.hint."
const STATE_TYPE = "omp-trainer.state"

function textContent(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""

  return content.filter(block => block.type === "text").map(block => block.text).join("\n")
}

export function trainer(pi) {
  pi.setLabel("Trainer")
  let enabled = process.env.OMP_TRAINER_ENABLED !== "0"
  let lastStatus = "Waiting for a user prompt"
  let pending
  let generation = 0
  let previousCapabilityId
  let visibleHint
  let hintRowCount = 0
  let listeningForResize = false

  function agentDir(ctx) {
    return ctx.agentDir || pi.pi.getAgentDir()
  }

  function setHintRows(ctx, rows) {
    const count = Math.max(hintRowCount, rows.length)
    for (let index = 0; index < count; index++) {
      const key = `${HINT_STATUS_PREFIX}${String(index).padStart(5, "0")}`
      ctx.ui.setStatus(key, rows[index])
    }
    hintRowCount = rows.length
  }

  function renderHint() {
    if (!visibleHint) return

    const { ctx, message, label } = visibleHint
    let columns = 80
    if (ctx.mode === "tui" && process.stdout.isTTY) columns = process.stdout.columns || columns

    setHintRows(ctx, renderHintCard(message, label, columns))
  }

  function showHint(ctx, message, label = "Trainer hint") {
    visibleHint = { ctx, message, label }
    renderHint()
    if (!listeningForResize && ctx.mode === "tui" && process.stdout.isTTY) {
      process.stdout.on("resize", renderHint)
      listeningForResize = true
    }
  }

  function cancelRequest() {
    generation++
    pending?.controller.abort()
    pending = undefined
  }

  function cancel(ctx) {
    cancelRequest()
    if (ctx.agent?.kind === "main") {
      visibleHint = undefined
      if (listeningForResize) {
        process.stdout.off("resize", renderHint)
        listeningForResize = false
      }
      setHintRows(ctx, [])
    }
  }

  function restore(_event, ctx) {
    cancel(ctx)
    enabled = process.env.OMP_TRAINER_ENABLED !== "0"
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.customType !== STATE_TYPE) continue

      if (typeof entry.data?.enabled === "boolean") enabled = entry.data.enabled
    }
    previousCapabilityId = undefined
    lastStatus = "Waiting for a user prompt"
  }

  function canRequest(ctx) {
    const jobs = ctx.getAsyncJobSnapshot?.()
    if (jobs?.running?.length || jobs?.delivery?.queued || jobs?.delivery?.delivering) return false

    return ctx.agent?.kind === "main" && ctx.hasUI && ctx.isIdle() && !ctx.hasPendingMessages()
  }

  async function requestRecall(ctx, promptText) {
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
      if (controller.signal.aborted) throw new Error("recall timed out")

      return replyText
    } catch (error) {
      if (generation !== expectedGeneration) return

      throw error
    } finally {
      ctx.clearTimer(deadline)
      if (pending === request) pending = undefined
    }
  }

  function showPromptHint(event, ctx) {
    if (ctx.agent?.kind !== "main" || !ctx.hasUI) return
    if (event.source !== "interactive" && event.source !== "rpc") return

    const request = event.text?.trim() ?? ""
    if (!request && !event.images?.length) return
    if (/^\/trainer(?:\s|$)/.test(request)) return

    cancel(ctx)
    if (!enabled) return

    try {
      const hint = promptHint(request, availableCapabilities(pi), readVerbosity(agentDir(ctx)), previousCapabilityId)
      if (!hint) {
        showHint(ctx, "Feature reminder: /trainer status shows whether hints are on and the shared global verbosity.")
        lastStatus = "Trainer control reminder shown for latest prompt"
        return
      }

      previousCapabilityId = hint.capabilityId
      if (hint.related) {
        lastStatus = "Related feature shown for latest prompt"
      } else {
        lastStatus = "Random feature reminder shown for latest prompt"
      }
      showHint(ctx, hint.message)
    } catch (error) {
      lastStatus = `Unavailable: ${String(error?.message ?? error).slice(0, 300)}`
      showHint(ctx, lastStatus, "Trainer status")
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
    const capabilities = availableCapabilities(pi).filter(capability => capability.name !== "trainer")
    if (!capabilities.length || Buffer.byteLength(JSON.stringify(capabilities)) > 24_000) {
      ctx.ui.notify("Recall skipped: no available-capability catalog within 24,000 UTF-8 bytes.", "info")
      return
    }
    lastStatus = "Finding a capability for your request"
    try {
      const replyText = await requestRecall(ctx, recallPrompt(request, capabilities))
      if (replyText === undefined || generation !== expectedGeneration) return

      const message = validateRecall(replyText, request, availableCapabilities(pi).filter(capability => capability.name !== "trainer"))
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
    description: "Per-prompt feature hints and model-assisted recall: on, off, verbosity, status, demo, recall",
    getArgumentCompletions: prefix => ["on", "off", "verbosity", "verbosity up", "verbosity down", "status", "demo", "recall"].filter(value => value.startsWith(prefix)).map(value => ({ value, label: value })),
    handler: async (args, ctx) => {
      const input = args.trim() || "status"
      const [action, request = ""] = input.split(/\s+(.*)/s)
      if (action === "recall") {
        await recall(ctx, request)
        return
      }

      if (action === "verbosity") {
        if (request && request !== "up" && request !== "down") {
          ctx.ui.notify("Usage: /trainer verbosity [up|down]", "info")
          return
        }
        try {
          if (request) {
            let verbosity = "quiet"
            if (request === "up") verbosity = "verbose"

            writeVerbosity(agentDir(ctx), verbosity)
            cancel(ctx)
          }
          const verbosity = readVerbosity(agentDir(ctx))
          ctx.ui.notify(`Trainer global verbosity: ${verbosity}. Shared across projects and running terminals in this OMP profile. Use /trainer verbosity up|down.`, "info")
        } catch (error) {
          ctx.ui.notify(`Trainer global verbosity unavailable: ${String(error?.message ?? error).slice(0, 300)}`, "warning")
        }
        return
      }

      if (input === "demo") {
        cancel(ctx)
        showHint(ctx, "Demo — /trainer status shows the loaded version and hint settings.\nPreview only; nothing executed.")
        lastStatus = "Demo hint shown; nothing executed"
        return
      }

      if (input !== action || !["status", "on", "off"].includes(action)) {
        ctx.ui.notify("Usage: /trainer on|off|verbosity [up|down]|status|demo|recall <request>", "info")
        return
      }
      if (action !== "status") {
        cancel(ctx)
        enabled = action === "on"
        pi.appendEntry(STATE_TYPE, { enabled })
        if (enabled) {
          lastStatus = "Waiting for a user prompt"
        } else {
          lastStatus = "Disabled"
        }
      }
      let state = "off"
      if (enabled) state = "on"

      try {
        const verbosity = readVerbosity(agentDir(ctx))
        ctx.ui.notify(`Trainer 0.8.0: ${state}. ${lastStatus}. Global verbosity: ${verbosity}. Use /trainer verbosity up|down for detailed or compact hints across terminals in this OMP profile. Automatic hints are model-free; only explicit recall uses a bounded, tool-free turn on the current model.`, "info")
      } catch (error) {
        ctx.ui.notify(`Trainer ${state}. Global verbosity unavailable: ${String(error?.message ?? error).slice(0, 300)}`, "warning")
      }
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
  pi.on("agent_start", cancelRequest)
  pi.on("input", showPromptHint)
  pi.on("session_shutdown", (_event, ctx) => cancel(ctx))
}

export default trainer
