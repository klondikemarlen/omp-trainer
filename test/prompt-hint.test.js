import assert from "node:assert/strict"
import test from "node:test"

import { availableCapabilities } from "../lib/available-capabilities.js"

import { promptHint } from "../lib/prompt-hint.js"

const read = { id: "tool:read", kind: "tool", name: "read", description: "Read file contents directly; omp://tools/read.md", invocation: null }
const grep = { id: "tool:grep", kind: "tool", name: "grep", description: "Search project text directly; omp://tools/grep.md", invocation: null }

test("when a registered skill is named in the prompt, its exact invocation is taught as related", () => {
  // Arrange
  const skill = { id: "skill:skill:simplify", kind: "skill", name: "skill:simplify", description: "Improve readability without changing behavior.", invocation: "/skill:simplify" }
  // Act
  const result = promptHint("/skill:simplify src/example.js", [read, skill], "verbose")
  // Assert
  assert.equal(result.capabilityId, "skill:skill:simplify")
  assert.match(result.message, /Related feature: skill: \/skill:simplify/)
})

test("when description keywords fit the request, the corresponding feature is related without a model call", () => {
  // Arrange
  const capabilities = [read, grep]
  // Act
  const result = promptHint("Search the text for timeout.", capabilities, "verbose")
  // Assert
  assert.equal(result.capabilityId, "tool:grep")
  assert.equal(result.related, true)
})

test("when a prompt contains only generic request words, the reminder is not presented as related", () => {
  // Arrange
  const request = "Please help with this project request."
  // Act
  const result = promptHint(request, [read], "verbose")
  // Assert
  assert.equal(result.related, false)
})

test("when a random reminder has alternatives, it does not repeat the immediately previous feature", () => {
  // Arrange
  const capabilities = [read, grep]
  // Act
  const result = promptHint("Good morning.", capabilities, "verbose", "tool:read")
  // Assert
  assert.equal(result.capabilityId, "tool:grep")
})

test("when only one feature is available, a repeated random reminder still appears instead of failing", () => {
  // Arrange
  const capabilities = [read]
  // Act
  const result = promptHint("Good morning.", capabilities, "verbose", "tool:read")
  // Assert
  assert.equal(result.capabilityId, "tool:read")
})

test("when a feature is disabled in the live registry, a related-looking prompt cannot teach it", () => {
  // Arrange
  const capabilities = availableCapabilities({ getActiveTools: () => ["grep"], getCommands: () => [] })
  // Act
  const result = promptHint("Read alpha.txt.", capabilities, "verbose")
  // Assert
  assert.equal(result.capabilityId, "tool:grep")
})

test("when a registered description is long, the hint remains a bounded feature card rather than dumping metadata", () => {
  // Arrange
  const capability = { id: "command:example", kind: "command", name: "example", invocation: "/example", description: "Explain this feature. " + "Details. ".repeat(100) }
  // Act
  const result = promptHint("example", [capability], "verbose")
  // Assert
  assert.ok(result.message.split("\n")[1].length <= 240)
})

test("when no feature is supplied, selection does not invent an installed capability", () => {
  // Arrange
  const capabilities = []
  // Act
  const result = promptHint("Read alpha.txt.", capabilities, "verbose")
  // Assert
  assert.equal(result, null)
})
