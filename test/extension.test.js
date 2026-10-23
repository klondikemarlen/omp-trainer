import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { afterEach } from "node:test"

import trainer from "../index.js"

const directories = new Set()

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

function runtime(evaluate, agentDir = mkdtempSync(join(tmpdir(), "omp-trainer-test-"))) {
  directories.add(agentDir)
  const handlers = new Map()
  const commands = new Map()
  const notifications = []
  const statuses = new Map()
  const entries = []
  const features = [
    { name: "verifier", description: "Inspect verification status without running checks.", source: "extension" },
    { name: "plan", description: "Plan the requested work before implementation.", source: "builtin" },
  ]
  const timers = new Set()
  const ctx = {
    agent: { kind: "main" },
    agentDir,
    hasUI: true,
    isIdle: () => true,
    hasPendingMessages: () => false,
    getAsyncJobSnapshot: () => ({ running: [], delivery: { queued: 0, delivering: false } }),
    sessionManager: { getBranch: () => entries, getSessionId: () => "session" },
    ui: {
      notify: message => notifications.push(message),
      setStatus: (key, content) => {
        if (content === undefined) {
          statuses.delete(key)
          return
        }

        statuses.set(key, content)
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
    getCommands: () => [...features, ...[...commands].map(([name, command]) => ({ name, description: command.description, source: "extension" }))],
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
  })
  async function emit(name, event = {}) { return handlers.get(name)?.(event, ctx) }
  async function input(text, source = "interactive") { return emit("input", { text, source }) }
  function hint() {
    const rows = [...statuses].filter(([key]) => key.startsWith("zz-omp-trainer.hint."))
      .sort(([left], [right]) => left.localeCompare(right)).map(([, text]) => text)
    if (rows.length === 0) return undefined

    return rows
  }
  return { ctx, agentDir, entries, features, notifications, statuses, hint, commands, emit, input }
}

test("when a user submits the first prompt without an inference API, a related hint appears immediately", async () => {
  // Arrange
  const host = runtime(undefined)
  // Act
  await host.input("Show verifier status without running checks.")
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Related feature: command: \/verifier/)
})

test("when primary and background work remain active, a queued user prompt still gets a hint", async () => {
  // Arrange
  const host = runtime(undefined)
  host.ctx.isIdle = () => false
  host.ctx.hasPendingMessages = () => true
  host.ctx.getAsyncJobSnapshot = () => ({ running: [{ id: "work" }], delivery: { queued: 1, delivering: true } })
  // Act
  await host.input("Plan the requested work.", "rpc")
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Related feature: command: \/plan/)
})

test("when the prompt has no related feature, a labelled random reminder is shown instead of silence", async () => {
  // Arrange
  const host = runtime(undefined)
  // Act
  await host.input("Good morning.")
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Random feature reminder:/)
})

test("when the primary starts and finishes work, the current prompt hint remains visible", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.input("Read alpha.txt.")
  const hint = host.hint()
  // Act
  await host.emit("agent_start")
  await host.emit("session_stop")
  await host.emit("agent_end")
  // Assert
  assert.deepEqual(host.hint(), hint)
})

test("when the next prompt is submitted, its feature replaces the previous prompt hint", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.input("Show verifier status.")
  // Act
  await host.input("Plan the requested work.")
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Related feature: command: \/plan/)
})

test("when an image-only prompt is submitted, a passive reminder still appears", async () => {
  // Arrange
  const host = runtime(undefined)
  // Act
  await host.emit("input", { text: "", images: [{ type: "image" }], source: "interactive" })
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Random feature reminder:/)
})

test("when a skill invocation is submitted, its raw registered name can select the related feature", async () => {
  // Arrange
  const host = runtime(undefined)
  host.features.push({ name: "skill:simplify", source: "skill", description: "Improve readability without changing behavior." })
  // Act
  await host.input("/skill:simplify src/example.js")
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Related feature: skill: \/skill:simplify/)
})

test("when input is synthetic rather than interactive or RPC, it does not rotate the user's hint", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.input("Read alpha.txt.")
  const hint = host.hint()
  // Act
  await host.input("Find project files.", "extension")
  // Assert
  assert.deepEqual(host.hint(), hint)
})

test("when the agent is a subagent, user input cannot create a main-session learning hint", async () => {
  // Arrange
  const host = runtime(undefined)
  host.ctx.agent = { kind: "sub" }
  // Act
  await host.input("Read alpha.txt.")
  // Assert
  assert.equal(host.hint(), undefined)
})

test("when UI is unavailable, the input event does not claim to display a hint", async () => {
  // Arrange
  const host = runtime(undefined)
  host.ctx.hasUI = false
  // Act
  await host.input("Read alpha.txt.")
  // Assert
  assert.equal(host.hint(), undefined)
})

test("when a disabled session resumes, subsequent prompts remain silent", async () => {
  // Arrange
  const host = runtime(undefined)
  host.entries.push({ type: "custom", customType: "omp-trainer.state", data: { enabled: false, mode: "verbose" } })
  await host.emit("session_start")
  // Act
  await host.input("Read alpha.txt.")
  // Assert
  assert.equal(host.hint(), undefined)
})

test("when Trainer is turned off, the visible hint is cleared and the next prompt cannot replace it", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.input("Read alpha.txt.")
  // Act
  await host.commands.get("trainer").handler("off", host.ctx)
  await host.input("Find project files.")
  // Assert
  assert.equal(host.hint(), undefined)
})

test("when status and verbosity are queried, the current passive hint is preserved", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.input("Read alpha.txt.")
  const hint = host.hint()
  // Act
  await host.input("/trainer status")
  await host.commands.get("trainer").handler("status", host.ctx)
  await host.input("/trainer verbosity")
  await host.commands.get("trainer").handler("verbosity", host.ctx)
  // Assert
  assert.deepEqual(host.hint(), hint)
})

test("when the session changes, the previous session's feature hint is not replayed", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.input("Read alpha.txt.")
  // Act
  await host.emit("session_switch")
  // Assert
  assert.equal(host.hint(), undefined)
})

test("when another terminal lowers verbosity, the next prompt still gets a compact hint", async () => {
  // Arrange
  const controller = runtime(undefined)
  await controller.commands.get("trainer").handler("verbosity up", controller.ctx)
  const observer = runtime(undefined, controller.agentDir)
  await observer.input("Read alpha.txt.")
  // Act
  await controller.commands.get("trainer").handler("verbosity down", controller.ctx)
  await observer.input("Read beta.txt.")
  // Assert
  assert.equal(observer.hint()?.length, 3)
})

test("when a long prompt arrives with an oversized catalog, passive selection is not skipped by inference limits", async () => {
  // Arrange
  const host = runtime(undefined)
  host.features.push({ name: "huge-command", description: "x".repeat(25_000), source: "extension" })
  // Act
  await host.input("Show verifier status. " + "x".repeat(32_000))
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Related feature: command: \/verifier/)
})

test("when new user input arrives during recall, the late recall result cannot overwrite its passive hint", async () => {
  // Arrange
  let finish
  const host = runtime(() => new Promise(resolve => { finish = resolve }))
  const recalling = host.commands.get("trainer").handler("recall Show verification status without running checks.", host.ctx)
  await new Promise(resolve => setImmediate(resolve))
  // Act
  await host.input("Plan the requested work.")
  finish({ replyText: JSON.stringify({ capabilityId: "command:verifier", reason: "Inspect verification status.", preservesIntent: true }) })
  await recalling
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Related feature: command: \/plan/)
})

test("when explicit recall is used while passive hints are disabled, it does not enable the session", async () => {
  // Arrange
  const host = runtime(async () => ({ replyText: JSON.stringify({ capabilityId: "command:verifier", reason: "Inspect verification status.", preservesIntent: true }) }))
  await host.commands.get("trainer").handler("off", host.ctx)
  // Act
  await host.commands.get("trainer").handler("recall Show verification status without running checks.", host.ctx)
  await host.commands.get("trainer").handler("status", host.ctx)
  // Assert
  assert.match(host.notifications.at(-1), /Trainer [^:]+: off\./)
})

test("when global settings are invalid, the prompt shows an availability diagnostic rather than unexplained silence", async () => {
  // Arrange
  const host = runtime(undefined)
  mkdirSync(join(host.agentDir, "trainer"))
  writeFileSync(join(host.agentDir, "trainer", "config.json"), JSON.stringify({ verbosity: "loud" }))
  // Act
  await host.input("Read alpha.txt.")
  // Assert
  assert.match(host.hint()?.[1] ?? "", /Unavailable: Global Trainer verbosity/)
})

test("when explicit recall has oversized unrelated history, bounded recall still produces its capability result", async () => {
  // Arrange
  const host = runtime(undefined)
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

    return { replyText: JSON.stringify({ capabilityId: "command:verifier", reason: "Inspect verification status.", preservesIntent: true }) }
  }
  // Act
  await host.commands.get("trainer").handler("recall Show verification status without running checks.", host.ctx)
  // Assert
  assert.match(host.hint()?.[1] ?? "", /command: \/verifier/)
})

test("when a disabled session requests a demo, the preview does not enable future prompt hints", async () => {
  // Arrange
  const host = runtime(undefined)
  await host.commands.get("trainer").handler("off", host.ctx)
  await host.commands.get("trainer").handler("demo", host.ctx)
  // Act
  await host.input("Read alpha.txt.")
  // Assert
  assert.equal(host.hint(), undefined)
})

test("when global verbosity cannot be written, the command reports failure instead of claiming it was saved", async () => {
  // Arrange
  const host = runtime(undefined)
  const invalidDirectory = join(host.agentDir, "not-a-directory")
  writeFileSync(invalidDirectory, "Keep this file")
  host.ctx.agentDir = invalidDirectory
  // Act
  await host.commands.get("trainer").handler("verbosity down", host.ctx)
  // Assert
  assert.match(host.notifications.at(-1), /global verbosity unavailable/)
})

test("when Trainer is disabled, the other extensions' footer messages remain visible", async () => {
  // Arrange
  const host = runtime(undefined)
  host.statuses.set("instance-control", "instance example")
  host.statuses.set("project-time", "1m (dev)")
  host.statuses.set("worktree-status", "cwd/wt: example")
  await host.input("Read alpha.txt.")
  // Act
  await host.commands.get("trainer").handler("off", host.ctx)
  // Assert
  assert.deepEqual(host.statuses, new Map([
    ["instance-control", "instance example"],
    ["project-time", "1m (dev)"],
    ["worktree-status", "cwd/wt: example"],
  ]))
})

test("when the terminal widens, the existing card reflows without leaving stale continuation rows", async t => {
  // Arrange
  const host = runtime(undefined)
  host.ctx.mode = "tui"
  let columns = 35
  const originalColumns = Object.getOwnPropertyDescriptor(process.stdout, "columns")
  const originalTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY")
  Object.defineProperty(process.stdout, "columns", { configurable: true, get: () => columns })
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true })
  t.after(async () => {
    await host.emit("session_shutdown")
    if (originalColumns) Object.defineProperty(process.stdout, "columns", originalColumns)
    else delete process.stdout.columns
    if (originalTty) Object.defineProperty(process.stdout, "isTTY", originalTty)
    else delete process.stdout.isTTY
  })
  await host.input("Show verifier status.")
  // Act
  columns = 100
  process.stdout.emit("resize")
  // Assert
  assert.equal(host.hint()?.length, 4)
})
