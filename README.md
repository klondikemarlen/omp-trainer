# omp-trainer
Post-completion coaching and on-demand capability recall that help OMP users achieve the same outcomes with less prompting and effort.

## Install and Control

Requires OMP with `runEphemeralTurn`, context transforms, managed timers, and the main-session `session_stop` lifecycle (exercised with OMP 18.12.6).

```sh
omp plugin install github:klondikemarlen/omp-trainer
```

Start a **new OMP process** after installation to load this release. Trainer is enabled by default; global verbosity starts at **verbose** until changed.

- `/trainer status` — show the loaded version, session enabled state, global verbosity, and latest evaluation outcome.
- `/trainer demo` — immediately show a clearly labelled preview through the real below-editor hint widget, without model inference.
- `/trainer recall <request>` — find one relevant currently available tool, command, or skill without executing the request.
- `/trainer verbosity` — report the shared verbosity setting.
- `/trainer verbosity up` — select verbose coaching across all projects and running terminals in this OMP profile.
- `/trainer verbosity down` — select quiet coaching everywhere in this profile.
- `/trainer off` — disable coaching and cancel pending inference.
- `/trainer on` — enable coaching.
- `OMP_TRAINER_ENABLED=0 omp` — default new sessions to disabled.
- `omp plugin disable omp-trainer` — disable the installed plugin entirely.

Verbosity is saved in `trainer/config.json` under the active OMP agent directory (normally `~/.omp/agent/trainer/config.json`). Every terminal using that profile reads the same setting, regardless of project or session. Raising verbosity in one terminal applies to other already-running processes at their next Trainer interaction or assessment; lowering it is also checked before an in-flight recommendation or notification is presented. There is no settings watcher, polling, or restart requirement after a verbosity change. Separate OMP profiles keep separate settings.

The two levels are `quiet` and `verbose`: `up` selects verbose, `down` selects quiet, and repeating either stays at that level. Writes atomically replace the private settings file. Invalid settings or failed writes produce a diagnostic rather than silently switching to louder coaching or claiming a change was saved.

The on/off choice remains **session-local**, is saved on the current branch, and is restored on resume; a saved choice overrides `OMP_TRAINER_ENABLED`. Changing global verbosity does not enable a disabled session. Global verbosity replaces the old `/trainer verbose`, `/trainer quiet`, and `OMP_TRAINER_MODE` interfaces; historical session `mode` metadata no longer overrides it. All current command arguments support native autocomplete.

Use `/trainer demo` when you want the hint to actually pop up without waiting for an automatic coaching opportunity. It is explicitly marked as a preview, not an assessment of your current work; it records no evaluation marker and starts no primary turn. It also works while automatic coaching is off without enabling it. The demo cancels pending automatic inference so a late result cannot overwrite it, and follows the same hint-clearing rules as normal coaching.

## Turn Coaching Up or Down

| Mode | Coaching opportunities | Visible automatic feedback |
| --- | --- | --- |
| `verbose` (default) | One supported lower-effort alternative, or an optional capability reminder grounded in your completed task | A short notification points to a new below-editor hint. Completed assessments with no tip, skipped evidence, unconfirmed completion, and failures are also reported. |
| `quiet` | Only a concrete, evidence-backed alternative that saves avoidable user effort | A below-editor hint when useful; other outcomes remain available through status. |

Verbose mode is useful while finding out whether Trainer helps. It can teach a relevant available tool, command, or skill even when your original request was perfectly reasonable. Discovery hints explain a concrete use for a similar task and are labelled as optional memory aids, not corrections. Trainer still declines generic, unavailable, intent-changing, or unsupported suggestions.

Both modes use the **same existing assessment schedule**: one bounded side turn for each eligible completed-work candidate, not extra turns, polling, or mid-task interruptions. More tips come from allowing relevant discovery, not more model requests. Inference still consumes the current provider's quota. Use `/trainer verbosity down` to reduce coaching across all enabled sessions in this profile, `/trainer verbosity up` to raise it again, or `/trainer off` to stop automatic assessment in the current session.

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

Explicit skill invocation is an optional memory aid: ordinary intent should already select matching workflows. An agent's failure to select one is not a user prompting mistake. Quiet automatic hints cite skills only when concrete avoidable effort exists; verbose mode can instead teach a task-relevant skill as an optional discovery reminder, without treating an omitted slash command as an error.

Recall works while automatic coaching is off without enabling it or recording a completed-work assessment. Its transient hint follows the same preservation and clearing rules as coaching. To recall a capability again, supply the request again; Trainer saves no hint history and scans no clipboard or cross-session archive. Recall requires idle primary/background work, accepts at most 8,000 UTF-8 bytes without truncation, and uses the same tool-free, 45-second, 128,000-byte request bounds as automatic assessment.

## What Triggers Coaching

Trainer observes `session_stop` without returning a decision, then schedules a managed callback after `agent_end`. Neither event alone proves the user's task is complete. The callback requires the main agent to be idle, no queued messages or outstanding background delivery, no unfinished recorded todos, and a successful terminal assistant answer. It then asks the **current configured model** to assess whether the relevant requested unit is actually complete.

An intermediate result, unfinished task, pending question, approval pause, or ambiguous completion must produce no tip. When completion is confirmed, quiet mode requires a concrete supported improvement; verbose mode also allows a relevant capability reminder. Trainer shows one labelled hint below the editor, alongside OMP's instance/development/cwd information:

> Trainer hint: You could have done this with less work by asking OMP to read both known files directly.
> Next time: “Read alpha.txt and beta.txt, add their apple counts, and report the total. No edits without approval.”
> Available capability: read (omp://tools/read.md).

The hint stays visible while you compose your next request or query `/trainer status`, `/trainer verbosity`, or the default `/trainer` action. It clears when you submit new work, start another task, disable/reset Trainer, change global verbosity from this terminal, change sessions, or shut down. Changing verbosity elsewhere governs future output; it does not redraw another terminal's already-visible hint. Hints are not restored on resume. Verbose mode gives a concise notification pointing to the hint rather than repeating its full text; quiet coaching uses only the widget. Status and usage commands still use notifications.

Lower-effort alternatives must quote real avoidable user effort; discovery reminders must quote the relevant user request. Both cite an active documented tool or a registered command's exact invocation. A suggested example must preserve required inputs, constraints, and approvals. Long prompts, missing slash commands, necessary retries, and the agent's failure to select an existing workflow are not user mistakes. Verbose feedback distinguishes a completed assessment with no tip from a skipped candidate, unconfirmed completion, or failed inference.

Trainer never runs the recommendation, blocks completion, starts another primary turn, edits guidance, installs packages, files proposals, or changes models, providers, or advisor cadence. Learner owns learning classification/proposals; shared guidance owners maintain accepted workflows; the primary selects and executes them; Verifier checks requirements. Trainer has no dependency on those plugins.

## Evidence, Privacy, and Limits

Trainer reads only the active session branch after the last assessed completed unit: at most 32 user/assistant text messages and 24,000 UTF-8 bytes. Oversized or insufficient evidence is skipped rather than silently truncated. Agent-attributed synthetic user messages are excluded.

The `runEphemeralTurn` API normally includes the current conversation snapshot. Trainer uses OMP's supported context transform to replace conversation messages with its assessment prompt, containing only the bounded evidence and available-capability catalog. This applies only to Trainer's exact in-flight request; primary turns and unrelated side requests keep their history. The **whole serialized request** remains limited to 128,000 bytes, including the inherited system prompt and any other extension transforms. Inference uses the session's configured provider, consumes its quota, disables tools, and is cancelled after 45 seconds or when new work/session changes intervene. Codex ephemeral turns reject output-token caps, so Trainer does not request one or switch models; the host's default reply bound and the cancellation deadline still apply. Unsupported hosts, failed inference, malformed decisions, or exceeded limits produce no suggestion; `/trainer status` exposes the latest diagnostic.

Only the session enabled flag and evaluation markers are appended as namespaced session metadata, outside model-visible conversation. The shared settings file stores only verbosity, not prompts or hints. No private prompt archive or cross-session archive scan exists. Markers prevent replay/resume and advisor/report-only updates from reusing the same completed effort. Coaching is a below-editor widget, not a message to the primary or other advisors.

If you have never seen coaching, `/trainer demo` checks that the hint renders, while `/trainer status` reports the latest automatic outcome and mode. A working demo does not prove automatic assessment succeeded. In verbose mode, automatic outcomes are also notified: `Assessed completed work: no supported coaching opportunity` means completion was confirmed but no valid tip was returned; `Deferred` means completion was not confirmed; `Skipped` means the work was ineligible; `Unavailable` identifies a failed assessment. Quiet mode deliberately suppresses these notifications. Silence alone does not establish that Trainer is working.

## Development and Release

```sh
npm test
git diff --check
omp --no-extensions --extension ./index.js
```

The Node test suite covers evidence validation, incomplete/no-op outcomes, active-work suppression, replay, disabled-state restoration, late-result cancellation, and hint clearing/preservation. Model judgments additionally require native QA: exercise a useful alternative, an incomplete step, a task with no useful alternative, resume/replay, and an agent workflow-selection failure in a fresh OMP process. Verify the actual hint below the editor, coexistence with existing status information, preservation while composing/checking status, and clearing on new work or disable.

Exercise both modes with **two processes already running in different projects in the same profile**. Raise verbosity in one terminal and verify the other's status and automatic assessment feedback follow it without a restart; lower it and verify a subsequent no-tip assessment produces no notification. A third new process must see the saved value, and historical session mode metadata must not override it. Confirm global changes preserve disabled sessions, suppress pending discovery when lowered elsewhere, and support native `verbosity`, `verbosity up`, and `verbosity down` autocomplete. An ordinary completed task may produce a grounded discovery tip in verbose mode without implying avoidable effort; quiet mode rejects discovery-only recommendations. Keep successful no-tip assessments distinct from skipped, deferred, or failed outcomes. Use an isolated agent-directory adapter for source QA so these checks do not change personal settings.

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
