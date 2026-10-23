import assert from "node:assert/strict"
import test from "node:test"

import { availableCapabilities } from "../lib/available-capabilities.js"

import { validateRecall } from "../lib/recall-prompt.js"

test("when a recalled skill fits, its registered invocation keeps every original constraint", () => {
  // Arrange
  const request = "Simplify src/example.js without changing behavior. Ask before edits; no commits, releases, or installs."
  const skills = [{ id: "skill:skill:simplify", kind: "skill", name: "skill:simplify", description: "Improve readability without changing behavior", invocation: "/skill:simplify" }]
  const reply = JSON.stringify({ capabilityId: "skill:skill:simplify", reason: "Makes existing code easier to understand.", preservesIntent: true })
  // Act
  const result = validateRecall(reply, request, skills)
  // Assert
  assert.match(result, /Next time: \/skill:simplify Simplify src\/example\.js without changing behavior\. Ask before edits; no commits, releases, or installs\./)
})

test("when a recalled skill is no longer available, no stale invocation is taught", () => {
  // Arrange
  const reply = JSON.stringify({ capabilityId: "skill:skill:simplify", reason: "Improve readability.", preservesIntent: true })
  // Act
  const result = validateRecall(reply, "Simplify the code.", [])
  // Assert
  assert.equal(result, null)
})

test("when a recall match would change intent, no invocation is taught", () => {
  // Arrange
  const skills = [{ id: "skill:skill:advance", kind: "skill", name: "skill:advance", invocation: "/skill:advance" }]
  const reply = JSON.stringify({ capabilityId: "skill:skill:advance", reason: "Implement the next feature.", preservesIntent: false })
  // Act
  const result = validateRecall(reply, "Explain the project only; do not implement anything.", skills)
  // Assert
  assert.equal(result, null)
})

test("when recall selects an ordinary command, its invocation stays separate from request prose", () => {
  // Arrange
  const request = "Show current verification status without running checks."
  const commands = [{ id: "command:verifier", kind: "command", name: "verifier", description: "Control verification", invocation: "/verifier" }]
  const reply = JSON.stringify({ capabilityId: "command:verifier", reason: "Inspect verification status.", preservesIntent: true })
  // Act
  const result = validateRecall(reply, request, commands)
  // Assert
  assert.match(result, /^command: \/verifier\.\n[\s\S]*\nRequest: Show current verification status without running checks\.\n/)
  assert.doesNotMatch(result, /\/verifier Show current verification status/)
})

test("when an old tool capability ID is returned, recall rejects it against the live catalog", () => {
  // Arrange
  const capabilities = availableCapabilities({
    getActiveTools: () => ["read", "grep"],
    getCommands: () => [{ name: "read-files", description: "Read file contents directly." }],
  })
  const reply = JSON.stringify({ capabilityId: "tool:read", reason: "Read the requested file.", preservesIntent: true })
  // Act
  const result = validateRecall(reply, "Read alpha.txt.", capabilities)
  // Assert
  assert.equal(result, null)
})
