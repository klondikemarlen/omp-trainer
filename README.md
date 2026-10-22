# omp-trainer
Post-completion coaching and on-demand capability recall that help OMP users achieve the same outcomes with less prompting and effort.

## Install and Control

Requires OMP with `runEphemeralTurn`, context transforms, managed timers, and the main-session `session_stop` lifecycle (exercised with OMP 18.12.6).

```sh
omp plugin install github:klondikemarlen/omp-trainer
```

Start a **new OMP process** after installation. Trainer is enabled by default.

- `/trainer status` — show the loaded version, enabled state, and latest evaluation outcome.
- `/trainer demo` — immediately show a clearly labelled preview through the real below-editor hint widget, without model inference.
- `/trainer recall <request>` — find one relevant currently available tool, command, or skill without executing the request.
- `/trainer off` — disable coaching and cancel pending inference.
- `/trainer on` — enable coaching.
- `OMP_TRAINER_ENABLED=0 omp` — default new sessions to disabled.
- `omp plugin disable omp-trainer` — disable the installed plugin entirely.

The on/off choice is saved in the current session and restored on resume. A saved session choice overrides the environment default. The command and its `on`, `off`, `status`, `demo`, and `recall` arguments support native autocomplete.

Use `/trainer demo` when you want the hint to actually pop up without waiting for an automatic coaching opportunity. It is explicitly marked as a preview, not an assessment of your current work; it records no evaluation marker and starts no primary turn. It also works while automatic coaching is off without enabling it. The demo cancels pending automatic inference so a late result cannot overwrite it, and follows the same hint-clearing rules as normal coaching.

## Find and Remember Capabilities

Use `/trainer recall` with the request you would otherwise retrieve from clipboard history. Trainer asks the current configured model to match it to one live capability, then shows a labelled `Trainer recall:` below the editor. The exact registered invocation and your original request are displayed together: no model rewrite can silently remove an input, approval, or completion requirement. Recall never executes that invocation.

For example:

```text
/trainer recall Investigate a small evidence-backed shortlist of hard-to-understand code hotspots. Choose one justified simplification without changing behavior. Ask before edits; no commits, releases, or installs.
```

If the installed `simplify` skill fits, the next-time prompt starts with `/skill:simplify` and retains the complete supplied request. The registry identifies skills separately from ordinary commands. Unavailable or intent-changing matches produce no recommendation; the four skills below are examples from MSSRT, not bundled Trainer dependencies.

Only skills combine their invocation with your request as a next-time prompt. Ordinary commands display the registered invocation separately from a `Request:` line: the command catalog does not establish which subcommands or arguments they accept. Tool matches also keep the request as prose rather than inventing slash syntax.

| Desired outcome | Skill invocation, only when registered |
| --- | --- |
| Move a project forward through one bounded delivered outcome | `/skill:advance` |
| Make an evidenced code hotspot easier to understand without changing behavior | `/skill:simplify` |
| Reassess purpose, knowledge, and implementation to find one justified improvement | `/skill:improve` |
| Finish the current work, verify delivery, and clean up owned resources safely | `/skill:wrap-up` |

Explicit skill invocation is an optional memory aid: ordinary intent should already select matching workflows. An agent's failure to select one is not a user prompting mistake. Automatic hints can cite live skills when concrete avoidable effort exists, but skill availability or an omitted slash command does not justify recurring advice.

Recall works while automatic coaching is off without enabling it or recording a completed-work assessment. Its transient hint follows the same preservation and clearing rules as coaching. To recall a capability again, supply the request again; Trainer saves no hint history and scans no clipboard or cross-session archive. Recall requires idle primary/background work, accepts at most 8,000 UTF-8 bytes without truncation, and uses the same tool-free, 45-second, 128,000-byte request bounds as automatic assessment.

## What Triggers Coaching

Trainer observes `session_stop` without returning a decision, then schedules a managed callback after `agent_end`. Neither event alone proves the user's task is complete. The callback requires the main agent to be idle, no queued messages or outstanding background delivery, no unfinished recorded todos, and a successful terminal assistant answer. It then asks the **current configured model** to assess whether the relevant requested unit is actually complete.

An intermediate result, unfinished task, pending question, approval pause, or ambiguous completion must produce no coaching. If a concrete supported improvement exists, Trainer shows one labelled hint below the editor, alongside OMP's instance/development/cwd information:

> Trainer hint: You could have done this with less work by asking OMP to read both known files directly.
> Next time: “Read alpha.txt and beta.txt, add their apple counts, and report the total. No edits without approval.”
> Available capability: read (omp://tools/read.md).

The hint stays visible while you compose your next request or query `/trainer status` (also the default `/trainer` action). It clears when you submit new work, start another task, disable/reset Trainer, change sessions, or shut down. Hints are not restored on resume, and coaching is not also emitted as a notification. Status and usage commands still use notifications.

Recommendations must quote real user effort and cite an active documented tool or a registered command's exact invocation. A shorter prompt must preserve required inputs, constraints, and approvals. Long prompts, missing slash commands, necessary retries, and the agent's failure to select an existing workflow are not user mistakes.

Trainer never runs the recommendation, blocks completion, starts another primary turn, edits guidance, installs packages, files proposals, or changes models, providers, or advisor cadence. Learner owns learning classification/proposals; shared guidance owners maintain accepted workflows; the primary selects and executes them; Verifier checks requirements. Trainer has no dependency on those plugins.

## Evidence, Privacy, and Limits

Trainer reads only the active session branch after the last assessed completed unit: at most 32 user/assistant text messages and 24,000 UTF-8 bytes. Oversized or insufficient evidence is skipped rather than silently truncated. Agent-attributed synthetic user messages are excluded.

The `runEphemeralTurn` API normally includes the current conversation snapshot. Trainer uses OMP's supported context transform to replace conversation messages with its assessment prompt, containing only the bounded evidence and available-capability catalog. This applies only to Trainer's exact in-flight request; primary turns and unrelated side requests keep their history. The **whole serialized request** remains limited to 128,000 bytes, including the inherited system prompt and any other extension transforms. Inference uses the session's configured provider, consumes its quota, disables tools, and is cancelled after 45 seconds or when new work/session changes intervene. Codex ephemeral turns reject output-token caps, so Trainer does not request one or switch models; the host's default reply bound and the cancellation deadline still apply. Unsupported hosts, failed inference, malformed decisions, or exceeded limits produce no suggestion; `/trainer status` exposes the latest diagnostic.

Only control flags and evaluation markers are appended as namespaced session metadata, outside model-visible conversation. No private prompt archive or cross-session archive scan exists. Markers prevent replay/resume and advisor/report-only updates from reusing the same completed effort. The coaching itself is a below-editor widget, not a message to the primary or other advisors.

If you have never seen coaching, `/trainer demo` checks that the hint renders, while `/trainer status` reports the latest automatic outcome. A working demo does not prove automatic assessment succeeded. `No supported coaching opportunity` means an assessment produced no suggestion; `Skipped` means the work was ineligible; `Unavailable` identifies a failed assessment. Silence alone does not establish that Trainer is working. Suggestions are deliberately uncommon: ordinary requests, necessary retries, and agent mistakes should not trigger prompting advice.

## Development and Release

```sh
npm test
git diff --check
omp --no-extensions --extension ./index.js
```

The Node test suite covers evidence validation, incomplete/no-op outcomes, active-work suppression, replay, disabled-state restoration, late-result cancellation, and hint clearing/preservation. Model judgments additionally require native QA: exercise a useful alternative, an incomplete step, a task with no useful alternative, resume/replay, and an agent workflow-selection failure in a fresh OMP process. Verify the actual hint below the editor, coexistence with existing status information, preservation while composing/checking status, and clearing on new work or disable.

Exercise `/trainer demo` separately: it must show an explicitly marked preview immediately, with no provider request, primary-agent start, or evaluation marker; preserve the disabled setting; cancel a pending assessment; and support argument autocomplete.

Exercise recall with real installed skills in a fresh process: select among `advance`, `simplify`, `improve`, and `wrap-up` for their distinct outcomes; decline an unavailable skill and an intent-changing match. Verify the exact registered invocation, verbatim constraints, no primary execution/evaluation marker, unchanged disabled state, status preservation, cancellation, and native `recall` autocomplete. Model selection remains a judgment; registry validation prevents teaching a capability that is no longer available.

For source QA, `--no-extensions` also skips plugin-provided skill discovery. Expose the actual installed skills through a disposable project's `.omp/skills` discovery path, or verify recall in a fresh normal process after installing the released Trainer artifact. Do not load both the installed Trainer and a source copy.

Issue branches use `issue-<number>-<outcome>`. Open a linked draft PR, complete self-review and focused native QA, then merge into `main`. No publishing CI or npm registry release is configured: the GitHub repository is the installable artifact.

For a release, update the version and changelog on the issue branch, merge, and tag the exact merged commit as `v<version>`. Create the GitHub release from that tag. Record the resolved tag commit, then verify the remote artifact:

```sh
omp plugin uninstall omp-trainer
omp plugin install github:klondikemarlen/omp-trainer
omp plugin list
```

Reconcile the installer's resolved GitHub revision and enabled installed version with the intended tag/commit. In a **new OMP process**, exercise the changed behavior, `/trainer status`, and command/argument autocomplete. A successful source test is not released-artifact proof. If native runtime or provider access is unavailable, retain that explicit blocker rather than claiming a mock-only release pass.
