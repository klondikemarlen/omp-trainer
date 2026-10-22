import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export function readVerbosity(agentDir) {
  let content
  try {
    content = readFileSync(join(agentDir, "trainer", "config.json"), "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return "verbose"

    throw error
  }

  const settings = JSON.parse(content)
  if (settings?.verbosity !== "quiet" && settings?.verbosity !== "verbose") {
    throw new Error("Global Trainer verbosity must be quiet or verbose")
  }

  return settings.verbosity
}

export function writeVerbosity(agentDir, verbosity) {
  const directory = join(agentDir, "trainer")
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporaryPath = join(directory, `.config-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporaryPath, `${JSON.stringify({ verbosity }, null, 2)}\n`, { mode: 0o600, flag: "wx" })
    renameSync(temporaryPath, join(directory, "config.json"))
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}
