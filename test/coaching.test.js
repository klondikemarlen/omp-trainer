import assert from "node:assert/strict"
import test from "node:test"

import { validateEvaluation } from "../lib/coaching.js"
import { captureWork, EVALUATION_TYPE, hasUnfinishedTodos } from "../lib/evidence.js"

const work = {
  key: "finished",
  messages: [
    { id: "human", role: "user", text: "I manually copied both files even though you can read them. Preserve approval before edits." },
    { id: "finished", role: "assistant", text: "The requested comparison is complete. No edits were made." },
  ],
}
const capabilities = [{ id: "tool:read", name: "read", description: "Read files; omp://tools/read.md", invocation: null }]

function usefulEvaluation() {
  return {
    completed: true,
    completionEvidence: { id: "finished", quote: "The requested comparison is complete." },
    recommendation: {
      capabilityId: "tool:read",
      effortEvidence: [{ id: "human", quote: "I manually copied both files" }],
      reason: "asking OMP to read the files instead of copying them manually.",
      shorterPrompt: "Compare both files directly; ask for approval before any edits.",
      preservesInputsAndApprovals: true,
      agentFailure: false,
    },
  }
}

test("when a supported alternative has real user evidence, one actionable prompt cites the active capability", () => {
  // Arrange
  const reply = JSON.stringify(usefulEvaluation())
  // Act
  const result = validateEvaluation(reply, work, capabilities)
  // Assert
  assert.match(result.message, /Compare both files directly; ask for approval before any edits\./)
})

test("when the evaluator finds an incomplete unit, coaching remains silent", () => {
  // Arrange
  const reply = JSON.stringify({ completed: false, recommendation: null })
  // Act
  const result = validateEvaluation(reply, work, capabilities)
  // Assert
  assert.deepEqual(result, { completed: false, message: null })
})

test("when a completed task has no useful alternative, coaching remains silent", () => {
  // Arrange
  const evaluation = usefulEvaluation()
  evaluation.recommendation = null
  // Act
  const result = validateEvaluation(JSON.stringify(evaluation), work, capabilities)
  // Assert
  assert.deepEqual(result, { completed: true, message: null })
})

test("when an alternative blames the primary agent, coaching remains silent", () => {
  // Arrange
  const evaluation = usefulEvaluation()
  evaluation.recommendation.agentFailure = true
  // Act
  const result = validateEvaluation(JSON.stringify(evaluation), work, capabilities)
  // Assert
  assert.equal(result.message, null)
})

test("when a claimed quote is not in user evidence, coaching remains silent", () => {
  // Arrange
  const evaluation = usefulEvaluation()
  evaluation.recommendation.effortEvidence[0].quote = "A fabricated manual step"
  // Act
  const result = validateEvaluation(JSON.stringify(evaluation), work, capabilities)
  // Assert
  assert.equal(result.message, null)
})

test("when a suggested capability is not installed, coaching remains silent", () => {
  // Arrange
  const evaluation = usefulEvaluation()
  evaluation.recommendation.capabilityId = "command:imaginary"
  // Act
  const result = validateEvaluation(JSON.stringify(evaluation), work, capabilities)
  // Assert
  assert.equal(result.message, null)
})

test("when the alternative drops required approvals, coaching remains silent", () => {
  // Arrange
  const evaluation = usefulEvaluation()
  evaluation.recommendation.preservesInputsAndApprovals = false
  // Act
  const result = validateEvaluation(JSON.stringify(evaluation), work, capabilities)
  // Assert
  assert.equal(result.message, null)
})

test("when a completed boundary is followed only by advisor updates, old human effort is not reconsidered", () => {
  // Arrange
  const entries = [
    { id: "human", type: "message", message: { role: "user", content: "Compare files" } },
    { type: "custom", customType: EVALUATION_TYPE, data: { key: "old", completed: true } },
    { id: "advisor", type: "message", message: { role: "user", attribution: "agent", content: "Consider another workflow" } },
    { id: "reply", type: "message", message: { role: "assistant", stopReason: "stop", content: "All complete" } },
  ]
  // Act
  const result = captureWork(entries)
  // Assert
  assert.equal(result, null)
})

test("when a final-looking tool-use turn has not completed, it is not a coaching candidate", () => {
  // Arrange
  const entries = [
    { id: "human", type: "message", message: { role: "user", content: "Compare files" } },
    { id: "reply", type: "message", message: { role: "assistant", stopReason: "toolUse", content: "All complete" } },
  ]
  // Act
  const result = captureWork(entries)
  // Assert
  assert.equal(result, null)
})

test("when the latest persisted todo snapshot has unfinished work, coaching is ineligible", () => {
  // Arrange
  const entries = [{ type: "message", message: { role: "toolResult", toolName: "todo", details: { phases: [{ name: "Work", tasks: [{ content: "Ship", status: "in_progress" }] }] } } }]
  // Act
  const result = hasUnfinishedTodos(entries)
  // Assert
  assert.equal(result, true)
})

test("when the complete answer is one character, the next task does not inherit its effort", () => {
  // Arrange
  const shortWork = { key: "answer", messages: [{ id: "answer", role: "assistant", text: "4" }] }
  const reply = JSON.stringify({ completed: true, completionEvidence: { id: "answer", quote: "4" }, recommendation: null })
  // Act
  const result = validateEvaluation(reply, shortWork, capabilities)
  // Assert
  assert.deepEqual(result, { completed: true, message: null })
})

test("when a shorter prompt requires a file path, the required input is preserved", () => {
  // Arrange
  const evaluation = usefulEvaluation()
  evaluation.recommendation.shorterPrompt = "Compare src/alpha.txt and src/beta.txt; ask before edits."
  // Act
  const result = validateEvaluation(JSON.stringify(evaluation), work, capabilities)
  // Assert
  assert.match(result.message, /Compare src\/alpha\.txt and src\/beta\.txt; ask before edits\./)
})
