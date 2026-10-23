import wrapAnsi from "wrap-ansi"

const WRAP_OPTIONS = { hard: true, trim: false }

function headerRows(label, columns) {
  const header = `--- ${label} `
  if (header.length <= columns) return [header.padEnd(columns, "-")]

  return ["-".repeat(columns), ...wrapAnsi(label, columns, WRAP_OPTIONS).split("\n")]
}

export function renderHintCard(message, label, columns) {
  const rows = headerRows(label, columns)
  rows.push(...wrapAnsi(message, columns, WRAP_OPTIONS).split("\n"))
  rows.push("-".repeat(columns))
  return rows
}

export default renderHintCard
