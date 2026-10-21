# omp-trainer
Post-completion coaching that helps OMP users achieve the same outcomes with less prompting and effort.

## Install and Control

Requires OMP with `runEphemeralTurn`, context transforms, managed timers, and the main-session `session_stop` lifecycle (exercised with OMP 18.12.6).

```sh
omp plugin install github:klondikemarlen/omp-trainer
```

Start a **new OMP process** after installation. Trainer is enabled by default.

- `/trainer status` — show the loaded version, enabled state, and latest evaluation outcome.
- `/trainer off` — disable coaching and cancel pending inference.
- `/trainer on` — enable coaching.
- `OMP_TRAINER_ENABLED=0 omp` — default new sessions to disabled.
- `omp plugin disable omp-trainer` — disable the installed plugin entirely.

The on/off choice is saved in the current session and restored on resume. A saved session choice overrides the environment default. The command and its `on`, `off`, and `status` arguments support native autocomplete.

## What Triggers Coaching

Trainer observes `session_stop` without returning a decision, then schedules a managed callback after `agent_end`. Neither event alone proves the user's task is complete. The callback requires the main agent to be idle, no queued messages or outstanding background delivery, no unfinished recorded todos, and a successful terminal assistant answer. It then asks the **current configured model** to assess whether the relevant requested unit is actually complete.

An intermediate result, unfinished task, pending question, approval pause, or ambiguous completion must produce no coaching. If a concrete supported improvement exists, Trainer shows one terminal notification:

> You could have done this with less work by asking OMP to read both known files directly.
> Next time: “Read alpha.txt and beta.txt, add their apple counts, and report the total. No edits without approval.”
> Available capability: read (omp://tools/read.md).

Recommendations must quote real user effort and cite an active documented tool or a registered command's exact invocation. A shorter prompt must preserve required inputs, constraints, and approvals. Long prompts, missing slash commands, necessary retries, and the agent's failure to select an existing workflow are not user mistakes.

Trainer never runs the recommendation, blocks completion, starts another primary turn, edits guidance, installs packages, files proposals, or changes models, providers, or advisor cadence. Learner owns learning classification/proposals; shared guidance owners maintain accepted workflows; the primary selects and executes them; Verifier checks requirements. Trainer has no dependency on those plugins.

## Evidence, Privacy, and Limits

Trainer reads only the active session branch after the last assessed completed unit: at most 32 user/assistant text messages and 24,000 UTF-8 bytes. Oversized or insufficient evidence is skipped rather than silently truncated. Agent-attributed synthetic user messages are excluded.

The `runEphemeralTurn` API normally includes the current conversation snapshot. Trainer uses OMP's supported context transform to replace conversation messages with its assessment prompt, containing only the bounded evidence and available-capability catalog. This applies only to Trainer's exact in-flight request; primary turns and unrelated side requests keep their history. The **whole serialized request** remains limited to 128,000 bytes, including the inherited system prompt and any other extension transforms. Inference uses the session's configured provider, consumes its quota, disables tools, and is cancelled after 45 seconds or when new work/session changes intervene. Codex ephemeral turns reject output-token caps, so Trainer does not request one or switch models; the host's default reply bound and the cancellation deadline still apply. Unsupported hosts, failed inference, malformed decisions, or exceeded limits produce no suggestion; `/trainer status` exposes the latest diagnostic.

Only control flags and evaluation markers are appended as namespaced session metadata, outside model-visible conversation. No private prompt archive or cross-session archive scan exists. Markers prevent replay/resume and advisor/report-only updates from reusing the same completed effort. The coaching itself is a UI notification, not a message to the primary or other advisors.

If you have never seen coaching, run `/trainer status` in a new OMP process. `No supported coaching opportunity` means an assessment produced no suggestion; `Skipped` means the work was ineligible; `Unavailable` identifies a failed assessment. Silence alone does not establish that Trainer is working. Suggestions are deliberately uncommon: ordinary requests, necessary retries, and agent mistakes should not trigger prompting advice.

## Development and Release

```sh
npm test
git diff --check
omp --no-extensions --extension ./index.js
```

The Node test suite covers evidence validation, incomplete/no-op outcomes, active-work suppression, replay, disabled-state restoration, and late-result cancellation. Model judgments additionally require native QA: exercise a useful alternative, an incomplete step, a task with no useful alternative, resume/replay, and an agent workflow-selection failure in a fresh OMP process.

Issue branches use `issue-<number>-<outcome>`. Open a linked draft PR, complete self-review and focused native QA, then merge into `main`. No publishing CI or npm registry release is configured: the GitHub repository is the installable artifact.

For a release, update the version and changelog on the issue branch, merge, and tag the exact merged commit as `v<version>`. Create the GitHub release from that tag. Record the resolved tag commit, then verify the remote artifact:

```sh
omp plugin uninstall omp-trainer
omp plugin install github:klondikemarlen/omp-trainer
omp plugin list
```

Reconcile the installer's resolved GitHub revision and enabled installed version with the intended tag/commit. In a **new OMP process**, exercise the changed behavior, `/trainer status`, and command/argument autocomplete. A successful source test is not released-artifact proof. If native runtime or provider access is unavailable, retain that explicit blocker rather than claiming a mock-only release pass.
