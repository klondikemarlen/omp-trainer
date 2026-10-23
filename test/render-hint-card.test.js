import assert from "node:assert/strict"
import { stripVTControlCharacters } from "node:util"
import test from "node:test"

import { renderHintCard } from "../lib/render-hint-card.js"

function visibleRows(rows) {
  return rows.map(row => stripVTControlCharacters(row))
}

function withoutWhitespace(text) {
  return text.replace(/\s/g, "")
}

test("when the terminal width changes, both borders fill the available columns", () => {
  // Arrange
  const widths = [7, 20, 41]
  // Act
  const cards = widths.map(columns => ({ columns, rows: visibleRows(renderHintCard("Short help", "Hint", columns)) }))
  // Assert
  for (const { columns, rows } of cards) {
    assert.equal(rows[0].length, columns)
    assert.equal(rows.at(-1), "-".repeat(columns))
    assert.ok(rows.every(row => row.length <= columns))
  }
})

test("when a label cannot fit in the border, it remains readable on separate wrapped rows", () => {
  // Arrange
  const label = "Trainer Hint"
  // Act
  const rows = visibleRows(renderHintCard("Help", label, 8))
  // Assert
  assert.equal(rows[0], "-".repeat(8))
  assert.equal(rows.at(-1), "-".repeat(8))
  assert.equal(withoutWhitespace(rows.slice(1, -2).join("")), "TrainerHint")
})

test("when a description and invocation exceed the width, their complete text survives hard wrapping", () => {
  // Arrange
  const message = "Description: Preserve every descriptive word through the final sentence.\nInvocation: /commands/run-thoroughly-with-a-very-long-argument=value_that_will_not_fit"
  // Act
  const rows = renderHintCard(message, "Hint", 12)
  // Assert
  const bodyRows = visibleRows(rows.slice(1, -1))
  assert.equal(withoutWhitespace(bodyRows.join("")), withoutWhitespace(message))
  assert.ok(bodyRows.every(row => row.length <= 12))
})

test("when wide Unicode and ANSI text wrap, display cells determine the line boundary", () => {
  // Arrange
  const message = "界界界界界界界\nA \u001B[31mred\u001B[39m"
  // Act
  const rows = renderHintCard(message, "Info", 10)
  // Assert
  assert.deepEqual(visibleRows(rows).slice(1, -1), ["界界界界界", "界界", "A red"])
})

test("when a card widens, fewer continuation rows preserve the complete message", () => {
  // Arrange
  const message = "Read the complete project history before responding, then include every final change."
  // Act
  const narrowBody = visibleRows(renderHintCard(message, "Hint", 14).slice(1, -1))
  const wideBody = visibleRows(renderHintCard(message, "Hint", 40).slice(1, -1))
  // Assert
  assert.ok(narrowBody.length > wideBody.length)
  assert.equal(withoutWhitespace(narrowBody.join("")), withoutWhitespace(message))
  assert.equal(withoutWhitespace(wideBody.join("")), withoutWhitespace(message))
})
