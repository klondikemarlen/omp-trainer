import assert from "node:assert/strict"
import test from "node:test"

import trainer from "../index.js"
import { EVALUATION_TYPE, STATE_TYPE } from "../lib/evidence.js"

function runtime(evaluate) {
  const handlers = new Map()
  const commands = new Map()
  const timers = new Set()
  const notifications = []
  const widgets = new Map()
  const hintPresentations = []
  const entries = [
    { type: "message", id: "human", message: { role: "user", content: "I manually copied both known files. No edits without approval." } },
    { type: "message", id: "final", message: { role: "assistant", stopReason: "stop", content: "The requested comparison is complete." } },
  ]
  const ctx = {
    agent: { kind: "main" },
    hasUI: true,
    isIdle: () => true,
    hasPendingMessages: () => false,
    getAsyncJobSnapshot: () => ({ running: [], delivery: { queued: 0, delivering: false } }),
    sessionManager: { getBranch: () => entries, getEntries: () => entries, getSessionId: () => "session" },
    ui: {
      notify: message => notifications.push(message),
      setWidget: (key, content) => {
        if (content === undefined) {
          widgets.delete(key)
          return
        }

        widgets.set(key, content)
        if (key === "omp-trainer.hint") hintPresentations.push(content)
      },
    },
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.add(timer); return timer },
    clearTimer: timer => timers.delete(timer),
    runEphemeralTurn: evaluate,
  }
  trainer({
    setLabel() {},
    on: (event, handler) => handlers.set(event, handler),
    registerCommand: (name, command) => commands.set(name, command),
    getActiveTools: () => ["read"],
    getCommands: () => [],
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  })
  async function emit(name, event = {}) { return handlers.get(name)?.(event, ctx) }
  async function settle() {
    await emit("session_stop")
    await emit("agent_end")
    const timer = [...timers].find(item => item.delay === 50)
    if (timer) { timers.delete(timer); await timer.callback() }
  }
  return { ctx, entries, notifications, widgets, hintPresentations, commands, emit, settle }
}

function usefulReply() {
  return { replyText: JSON.stringify({
    completed: true,
    completionEvidence: { id: "final", quote: "The requested comparison is complete." },
    recommendation: {
      capabilityId: "tool:read",
      effortEvidence: [{ id: "human", quote: "I manually copied both known files." }],
      reason: "reading both files directly instead of copying their contents.",
      shorterPrompt: "Compare both known files directly. No edits without approval.",
      preservesInputsAndApprovals: true,
      agentFailure: false,
    },
  }) }
}

test("when unrelated history exceeds the request budget, completed work still records a coaching assessment", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  host.ctx.runEphemeralTurn = async options => {
    const messages = [
      { role: "custom", content: "Unrelated prior output: " + "x".repeat(160_000) },
      { role: "user", content: [{ type: "text", text: options.promptText }] },
    ]
    const transformed = await host.emit("context", { messages })
    const requestMessages = transformed?.messages ?? messages
    if (Buffer.byteLength(JSON.stringify(requestMessages)) > options.maxContextBytes) {
      throw new Error("Ephemeral turn context exceeds the configured limit")
    }

    return usefulReply()
  }
  // Act
  await host.settle()
  // Assert
  const assessment = host.entries.findLast(entry => entry.customType === EVALUATION_TYPE)
  assert.deepEqual(assessment?.data, { key: "final", completed: true, shown: true })
})

test("when completed work is replayed after state reconstruction, the original coaching appears only once", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  // Act
  await host.settle()
  await host.emit("session_start")
  await host.settle()
  // Assert
  assert.equal(host.hintPresentations.length, 1)
})

test("when an intermediate yield has no stop boundary, no coaching is shown", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  // Act
  await host.emit("agent_end")
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})

test("when a background job still owns work, no coaching is shown", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  host.ctx.getAsyncJobSnapshot = () => ({ running: [{ id: "job" }], delivery: { queued: 0 } })
  // Act
  await host.settle()
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})

test("when coaching is disabled and the session resumes, no coaching is shown", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  // Act
  await host.commands.get("trainer").handler("off", host.ctx)
  await host.emit("session_start")
  await host.settle()
  // Assert
  assert.deepEqual(host.entries.filter(entry => entry.customType === EVALUATION_TYPE), [])
})

test("when a new task starts during evaluation, stale coaching is discarded", async () => {
  // Arrange
  let finish
  const host = runtime(() => new Promise(resolve => { finish = resolve }))
  // Act
  const settling = host.settle()
  await new Promise(resolve => setImmediate(resolve))
  await host.emit("agent_start")
  finish(usefulReply())
  await settling
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})

test("when inference fails, the completed primary work stays closed with no coaching", async () => {
  // Arrange
  const host = runtime(async () => { throw new Error("Provider unavailable") })
  // Act
  await host.settle()
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})

test("when existing disabled state is reconstructed, status reports the persisted control", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  host.entries.push({ type: "custom", customType: STATE_TYPE, data: { enabled: false } })
  // Act
  await host.emit("session_start")
  await host.commands.get("trainer").handler("status", host.ctx)
  // Assert
  assert.match(host.notifications.at(-1), /Trainer [^:]+: off\./)
})

test("when the next task starts, the previous coaching hint disappears", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  await host.settle()
  // Act
  await host.emit("agent_start")
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})

test("when Trainer is disabled, its visible coaching hint disappears", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  await host.settle()
  // Act
  await host.commands.get("trainer").handler("off", host.ctx)
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})

test("when the user queries default status, the coaching hint remains visible", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  await host.settle()
  // Act
  await host.emit("input", { text: "/trainer" })
  await host.commands.get("trainer").handler("", host.ctx)
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), true)
})

test("when the user switches sessions, the previous session's hint disappears", async () => {
  // Arrange
  const host = runtime(async () => usefulReply())
  await host.settle()
  // Act
  await host.emit("session_switch")
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})

test("when the user requests a demo without an inference API, the hint is visibly marked as a preview", async () => {
  // Arrange
  const host = runtime(undefined)
  // Act
  await host.commands.get("trainer").handler("demo", host.ctx)
  // Assert
  assert.match(host.widgets.get("omp-trainer.hint")?.[0] ?? "", /^Trainer hint: Demo/)
})

test("when a demo is shown, no completed-work assessment is recorded", async () => {
  // Arrange
  const host = runtime(undefined)
  // Act
  await host.commands.get("trainer").handler("demo", host.ctx)
  // Assert
  const evaluations = host.entries.filter(entry => entry.customType === EVALUATION_TYPE)
  assert.deepEqual(evaluations, [])
})

test("when disabled coaching is previewed, automatic coaching stays disabled", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.commands.get("trainer").handler("off", host.ctx)
  // Act
  await host.commands.get("trainer").handler("demo", host.ctx)
  await host.commands.get("trainer").handler("status", host.ctx)
  // Assert
  assert.match(host.notifications.at(-1), /Trainer [^:]+: off\./)
})

test("when a pending assessment finishes after a demo, the real result cannot overwrite the preview", async () => {
  // Arrange
  let finish
  const host = runtime(() => new Promise(resolve => { finish = resolve }))
  const settling = host.settle()
  await new Promise(resolve => setImmediate(resolve))
  // Act
  await host.commands.get("trainer").handler("demo", host.ctx)
  finish(usefulReply())
  await settling
  // Assert
  assert.match(host.widgets.get("omp-trainer.hint")?.[0] ?? "", /^Trainer hint: Demo/)
})

test("when recall is requested while automatic coaching is off, the setting stays off", async () => {
  // Arrange
  const host = runtime(async () => ({ replyText: JSON.stringify({ capabilityId: "tool:read", reason: "Read known files directly.", preservesIntent: true }) }))
  await host.commands.get("trainer").handler("off", host.ctx)
  // Act
  await host.commands.get("trainer").handler("recall Read both known files without edits.", host.ctx)
  await host.commands.get("trainer").handler("status", host.ctx)
  // Assert
  assert.match(host.notifications.at(-1), /Trainer [^:]+: off\. Recall shown; nothing executed\./)
})

test("when recall has no matching capability, it does not mark the task as assessed", async () => {
  // Arrange
  const host = runtime(async () => ({ replyText: "null" }))
  // Act
  await host.commands.get("trainer").handler("recall Use the unavailable skill to publish a book.", host.ctx)
  // Assert
  assert.deepEqual(host.entries.filter(entry => entry.customType === EVALUATION_TYPE), [])
})

test("when new work starts during recall, its late result stays hidden", async () => {
  // Arrange
  let finish
  const host = runtime(() => new Promise(resolve => { finish = resolve }))
  const recalling = host.commands.get("trainer").handler("recall Read both known files.", host.ctx)
  // Act
  await host.emit("input", { text: "Start new work" })
  finish({ replyText: JSON.stringify({ capabilityId: "tool:read", reason: "Read files directly.", preservesIntent: true }) })
  await recalling
  // Assert
  assert.equal(host.widgets.has("omp-trainer.hint"), false)
})
