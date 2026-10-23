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
    if (!command.description) continue
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

  return capabilities
}

export function describeCapability(capability) {
  if (capability.invocation) return `${capability.kind ?? "command"}: ${capability.invocation}`

  const citation = capability.description.split("; ").at(-1)
  return `tool: ${capability.name} (${citation})`
}

export default availableCapabilities
