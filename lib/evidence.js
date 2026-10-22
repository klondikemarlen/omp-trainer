export const STATE_TYPE = "omp-trainer.state"
export const EVALUATION_TYPE = "omp-trainer.evaluation"
export const MAX_EVIDENCE_BYTES = 24_000

export function textContent(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""

  return content.filter(block => block.type === "text").map(block => block.text).join("\n")
}

export function captureWork(entries) {
  let boundary = -1
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index].customType === EVALUATION_TYPE && entries[index].data?.completed) {
      boundary = index
      break
    }
  }

  const messages = []
  for (const entry of entries.slice(boundary + 1)) {
    if (entry.type !== "message") continue
    const message = entry.message
    if (message.role !== "user" && message.role !== "assistant") continue
    if (message.attribution === "agent") continue

    const text = textContent(message.content)
    if (!text.trim()) continue
    messages.push({ id: entry.id, role: message.role, text })
  }

  if (!messages.some(message => message.role === "user")) return null
  const last = messages.at(-1)
  if (last?.role !== "assistant") return null
  if (messages.length > 32 || Buffer.byteLength(JSON.stringify(messages)) > MAX_EVIDENCE_BYTES) return null

  const finalEntry = entries.find(entry => entry.id === last.id)
  if (finalEntry.message.stopReason !== "stop") return null
  if (finalEntry.message.content?.some?.(block => block.type === "toolCall")) return null

  return { key: last.id, messages }
}

export function availableCapabilities(pi) {
  const capabilities = []
  // Availability comes from this session; these descriptions cite the bundled OMP tool docs.
  const documentedTools = {
    read: "Read file contents directly; omp://tools/read.md",
    grep: "Search project text directly; omp://tools/grep.md",
    glob: "Find project files directly; omp://tools/glob.md",
    task: "Delegate independent tasks together; omp://tools/task.md",
  }
  for (const name of pi.getActiveTools()) {
    if (!documentedTools[name]) continue
    capabilities.push({ id: `tool:${name}`, kind: "tool", name, description: documentedTools[name], invocation: null })
  }
  for (const command of pi.getCommands()) {
    if (!command.description || command.name === "trainer") continue
    if (!/^[\w:.-]+$/.test(command.name)) continue
    const kind = command.source === "skill" ? "skill" : "command"
    capabilities.push({
      id: `${kind}:${command.name}`,
      kind,
      name: command.name,
      description: command.description,
      invocation: `/${command.name}`,
    })
  }
  if (Buffer.byteLength(JSON.stringify(capabilities)) > 24_000) return []

  return capabilities
}

export function hasUnfinishedTodos(entries) {
  const todo = entries.findLast(entry => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "todo")
  if (!todo) return false
  const phases = todo.message.details?.phases
  if (!Array.isArray(phases)) return true

  return phases.some(phase => !Array.isArray(phase.tasks) || phase.tasks.some(task => task.status !== "completed" && task.status !== "abandoned"))
}
