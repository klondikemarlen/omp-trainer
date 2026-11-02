const SHORTCUTS = [
  {
    id: "app.message.followUp",
    name: "Send follow-up prompt",
    description: "While the agent is working, queue your prompt as a follow-up instead of steering the current turn.",
  },
  {
    id: "app.clipboard.copyPrompt",
    name: "Copy prompt",
    description: "Copy the current prompt from the editor to the clipboard without submitting it.",
  },
  {
    id: "app.message.dequeue",
    name: "Edit queued message",
    description: "Restore a queued message to the editor so you can edit it before it is sent.",
  },
  {
    id: "app.history.search",
    name: "Search prompt history",
    description: "Search previous prompts to reuse a request without hunting through clipboard history.",
  },
  {
    id: "app.editor.external",
    name: "Open external editor",
    description: "Edit a long prompt in your configured external editor, then return it to OMP.",
  },
  {
    id: "tui.input.newLine",
    name: "Insert newline",
    description: "Add a new line to a multiline prompt without submitting it.",
  },
  {
    id: "app.clipboard.pasteTextRaw",
    name: "Paste raw text",
    description: "Paste clipboard text into the editor without collapsing it into an attachment.",
  },
  {
    id: "app.tools.expand",
    name: "Expand tool output",
    description: "Toggle expanded tool output to inspect more of the agent's results.",
  },
]

export function shortcutCapabilities(pi) {
  if (!pi.pi?.boundKeys || !pi.pi?.formatKeyHints) return []

  const capabilities = []
  for (const shortcut of SHORTCUTS) {
    const keys = pi.pi.boundKeys(shortcut.id, [])
    if (!keys.length) continue

    capabilities.push({
      id: `shortcut:${shortcut.id}`,
      kind: "keyboard shortcut",
      name: shortcut.name,
      description: shortcut.description,
      invocation: pi.pi.formatKeyHints(keys),
    })
  }

  return capabilities
}

export default shortcutCapabilities
