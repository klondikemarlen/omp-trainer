import assert from "node:assert/strict"
import test from "node:test"

import { availableCapabilities } from "../lib/available-capabilities.js"

import { promptHint } from "../lib/prompt-hint.js"

const readFiles = { id: "command:read-files", kind: "command", name: "read-files", description: "Read file contents directly.", invocation: "/read-files" }
const searchText = { id: "skill:search-text", kind: "skill", name: "search-text", description: "Search project text directly.", invocation: "/search-text" }

test("when a registered skill is named in the prompt, its exact invocation is taught as related", () => {
  // Arrange
  const skill = { id: "skill:skill:simplify", kind: "skill", name: "skill:simplify", description: "Improve readability without changing behavior.", invocation: "/skill:simplify" }
  // Act
  const result = promptHint("/skill:simplify src/example.js", [readFiles, skill], "verbose")
  // Assert
  assert.equal(result.capabilityId, "skill:skill:simplify")
  assert.match(result.message, /Related feature: skill: \/skill:simplify/)
})

test("when description keywords fit the request, the corresponding feature is related without a model call", () => {
  // Arrange
  const capabilities = [readFiles, searchText]
  // Act
  const result = promptHint("Search the text for timeout.", capabilities, "verbose")
  // Assert
  assert.equal(result.capabilityId, "skill:search-text")
  assert.equal(result.related, true)
})

test("when a prompt contains only generic request words, the reminder is not presented as related", () => {
  // Arrange
  const request = "Please help with this project request."
  // Act
  const result = promptHint(request, [readFiles], "verbose")
  // Assert
  assert.equal(result.related, false)
})

test("when a random reminder has alternatives, it does not repeat the immediately previous feature", () => {
  // Arrange
  const capabilities = [readFiles, searchText]
  // Act
  const result = promptHint("Good morning.", capabilities, "verbose", "command:read-files")
  // Assert
  assert.equal(result.capabilityId, "skill:search-text")
})

test("when only one feature is available, a repeated random reminder still appears instead of failing", () => {
  // Arrange
  const capabilities = [readFiles]
  // Act
  const result = promptHint("Good morning.", capabilities, "verbose", "command:read-files")
  // Assert
  assert.equal(result.capabilityId, "command:read-files")
})

test("when a command is disabled in the live registry, a related-looking prompt cannot teach it", () => {
  // Arrange
  const capabilities = availableCapabilities({
    getCommands: () => [],
  })
  // Act
  const result = promptHint("Search project text for timeout.", capabilities, "verbose")
  // Assert
  assert.equal(result, null)
})

test("when agent tools are active, the catalog still teaches only directly invocable commands", () => {
  // Arrange
  const registry = {
    getActiveTools: () => ["read", "grep", "glob", "task"],
    getCommands: () => [{ name: "read-files", description: "Read file contents directly." }],
  }
  // Act
  const capabilities = availableCapabilities(registry)
  // Assert
  assert.deepEqual(capabilities, [{
    id: "command:read-files",
    kind: "command",
    name: "read-files",
    description: "Read file contents directly.",
    invocation: "/read-files",
  }])
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
