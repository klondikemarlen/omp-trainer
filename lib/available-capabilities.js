export function availableCapabilities(pi) {
  const capabilities = []
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
  return `${capability.kind}: ${capability.invocation}`
}

export default availableCapabilities
