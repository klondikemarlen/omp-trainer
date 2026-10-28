# omp-trainer
A passive skill or command reminder when OMP starts and on every submitted prompt: related when feature keywords fit, otherwise random. Explicit recall provides model-assisted help finding a registered skill or slash command.

## Install and Control

Requires OMP's main-session external `input` hook, registered command/skill catalog, and keyed footer statuses (exercised with OMP 18.12.6). Explicit recall additionally uses `runEphemeralTurn`, context transforms, and managed timers.

```sh
omp plugin install github:klondikemarlen/omp-trainer
```

Start a **new OMP process** after installation to load this release. Trainer is enabled by default and shows a random feature reminder immediately, before the first prompt; global verbosity starts at **verbose** until changed. Disabled sessions stay silent, including on resume.

- `/trainer status` — show the loaded version, session enabled state, global verbosity, and latest hint or recall outcome.
- `/trainer demo` — immediately show a clearly labelled preview through the real footer card, without model inference.
- `/trainer recall <request>` — find one relevant registered skill or command without executing the request.
- `/trainer verbosity` — report the shared verbosity setting.
- `/trainer verbosity up` — select verbose coaching across all projects and running terminals in this OMP profile.
- `/trainer verbosity down` — select quiet coaching everywhere in this profile.
- `/trainer off` — disable coaching and cancel pending inference.
- `/trainer on` — enable coaching.
- `OMP_TRAINER_ENABLED=0 omp` — default new sessions to disabled.
- `omp plugin disable omp-trainer` — disable the installed plugin entirely.

Verbosity is saved in `trainer/config.json` under the active OMP agent directory (normally `~/.omp/agent/trainer/config.json`). Every terminal using that profile reads the same setting, regardless of project or session. Changes apply to its next automatic hint or status query without polling or restarting; separate OMP profiles keep separate settings. Verbosity controls card detail, not frequency: both levels show a hint at startup and on every supported prompt.

The two levels are `quiet` and `verbose`: `up` selects detailed cards, `down` selects compact cards, and repeating either stays at that level. Writes atomically replace the private settings file. Invalid settings or failed writes produce a diagnostic rather than silently switching to louder output or claiming a change was saved.

The on/off choice remains **session-local**, is saved on the current branch, and is restored on resume; a saved choice overrides `OMP_TRAINER_ENABLED`. Changing global verbosity does not enable a disabled session. Global verbosity replaces the old `/trainer verbose`, `/trainer quiet`, and `OMP_TRAINER_MODE` interfaces; historical session `mode` metadata no longer overrides it. All current command arguments support native autocomplete.

Use `/trainer demo` to preview the same footer card immediately, without submitting work or requesting a model. It is explicitly marked as a preview, works while passive hints are off without enabling them, and cancels pending recall so a late result cannot overwrite it.

## Turn Coaching Up or Down

| Level | Every supported prompt | Card detail |
| --- | --- | --- |
| `verbose` (default) | A related or random skill/command reminder | Feature category, exact registered invocation, and a concise description, wrapped to the terminal width. |
| `quiet` | A related or random skill/command reminder | A compact feature summary and invocation, wrapped as needed. |

Use `/trainer verbosity down` when the detailed cards are distracting, `/trainer verbosity up` to restore descriptions, or `/trainer off` to stop automatic hints in the current session. Global verbosity never enables a deliberately disabled session. Passive hints make **no provider requests** and do not consume model quota.

## Find and Remember Capabilities

Use `/trainer recall` with the request you would otherwise retrieve from clipboard history. Trainer asks the current configured model to match it to one live capability, then shows a labelled `Trainer recall` footer card. The exact registered invocation and your original request are supplied together: no model rewrite can silently remove an input, approval, or completion requirement. Recall never executes that invocation.

For example:

```text
/trainer recall Investigate a small evidence-backed shortlist of hard-to-understand code hotspots. Choose one justified simplification without changing behavior. Ask before edits; no commits, releases, or installs.
```

If the installed `simplify` skill fits, the next-time prompt starts with `/skill:simplify` and retains the complete supplied request. The registry identifies skills separately from ordinary commands. Unavailable or intent-changing matches produce no recommendation; the four skills below are examples from MSSRT, not bundled Trainer dependencies.

Only skills combine their invocation with your request as a next-time prompt. Ordinary commands display the registered invocation separately from a `Request:` line: the command catalog does not establish which subcommands or arguments they accept.

| Desired outcome | Skill invocation, only when registered |
| --- | --- |
| Move a project forward through one bounded delivered outcome | `/skill:advance` |
| Make an evidenced code hotspot easier to understand without changing behavior | `/skill:simplify` |
| Reassess purpose, knowledge, and implementation to find one justified improvement | `/skill:improve` |
| Finish the current work, verify delivery, and clean up owned resources safely | `/skill:wrap-up` |

Explicit skill invocation is an optional memory aid: ordinary intent should already select matching workflows. An agent's failure to select one is not a user prompting mistake. Automatic hints may remind you about a relevant live skill without asserting that your request needed correcting; unrelated reminders are labelled as random.

Recall works while passive hints are off without enabling them. It never executes the supplied request or saves a completed-work assessment. To recall a capability again, supply the request again; Trainer stores no hint history and scans no clipboard or cross-session archive. Recall requires idle primary/background work and uses the inference bounds below. Global verbosity controls automatic feature-card detail, not the verbatim request preserved in an explicit recall result.

## Passive Learning at Startup and on Every Prompt

At startup, Trainer restores the session's on/off choice, then shows a random reminder from the live skill/command catalog when enabled in a main session with a usable UI. It uses the same footer card and shared verbosity as prompt hints, without submitting work or requesting a model.

Trainer observes human input **at submission**, before command/skill expansion and queue insertion. A normal first prompt, a later prompt, or a steering/follow-up submission receives its hint immediately, even while primary or background work is active. Task completion, todos, conversation size, model availability, and successful inference are not prerequisites.

Selection is deliberately simple and model-free:
- Meaningful feature-name or description keywords can select a **Related feature**. This is a keyword heuristic, not a semantic assessment of your intent.
- With no supported keyword match, a **Random feature reminder** teaches an available capability without pretending it relates to the task. When alternatives exist, random selection avoids the immediately previous feature; related prompts can still select the same relevant feature.
- The catalog contains only currently registered skills and slash commands that the prompter can invoke. Agent tools such as `read`, `grep`, `glob`, and `task` are not recommendations. Trainer's own controls can also be taught. No unavailable command, undocumented arguments, or rewritten user prompt is invented.

For example:

> --- Trainer hint -------------------------------------------
> Related feature: skill: /skill:simplify.
> Make an evidenced code hotspot easier to understand without
> changing behavior.
> ------------------------------------------------------------

The card stays visible during agent start, streaming, completion, and composing the next request. The next submitted prompt replaces it, including the initial startup card. Trainer appears **below the instance, development-time, and cwd/worktree messages**, between dashed separators, with no duplicate notification. Demo, recall, and availability diagnostics use the same card.

OMP 18.12.6 renders below-editor widgets above footer statuses, so Trainer uses its own lexically last `zz-omp-trainer.hint.*` status rows instead. Other extensions retain ownership of their statuses and can refresh them without moving Trainer above them.

In a native TUI, both borders fill the terminal's actual column count. Text wraps by display width, including Unicode and long unbroken invocations. The existing card reflows immediately on terminal resize, and widening removes stale continuation rows. The card retains all supplied content rather than imposing a fixed physical-row limit; short terminals may not have room to display an unusually long explicit recall all at once.

RPC hosts do not expose their viewport dimensions through OMP 18.12.6's status API. They receive an 80-column wrapped card; remote full-width borders and resize reflow are not guaranteed. Native resizing uses the local TTY's `resize` event, not polling or inference, and the listener is removed when the card is cleared.

`/trainer`, `/trainer status`, and `/trainer verbosity` preserve the card. Trainer's own commands do not trigger a second passive reminder: demo, recall, disable, and verbosity changes own their display behavior. Session changes and shutdown clear the card without replaying it; starting a new OMP process, including a resumed session, generates a fresh startup reminder if enabled. When no other feature catalog is available, Trainer can still remind you about its own status control.

Supported ingress is main-session Enter/Ctrl+Enter and RPC/RPC UI `prompt`, `steer`, `follow_up`, and `abort_and_prompt`. Image-only input also gets a reminder. Empty drafts, synthetic/advisor traffic, queue replay, and subagent chat do not rotate main-session hints. OMP's synthetic `.`/`c` continuation shortcuts, print/ACP entry paths outside the external-input-hook contract, and hosts without a usable UI do not get a fabricated hint display.

These are passive learning cards, **not instructions to the primary agent**, corrections of user behavior, or permission to execute the advertised feature. Trainer never changes models, providers, advisor cadence, guidance, installed packages, or project files. Learner and Verifier retain their existing roles.

## Evidence, Privacy, and Limits

Startup hints inspect only the live skill/command catalog; prompt hints additionally inspect submitted text for keyword selection. They do not scan conversation history, wait for stop hooks, infer task completion, or request an assessment. Long prompts and catalogs are not rejected by inference evidence limits. Feature descriptions are summarized to at most 240 characters, then wrapped for display; user requests are not rewritten.

Only the session enabled flag is appended as Trainer state metadata. The shared settings file stores only verbosity. Trainer retains the previous feature identifier in memory to avoid consecutive random repeats, but stores no prompt or hint archive. Historical completion-assessment markers are no longer read or written. The footer card is not injected into primary/advisor model context.

**Explicit recall alone uses inference:** at most 8,000 UTF-8 bytes of request text and a 24,000-byte available-capability catalog, without silent request truncation. It uses the session's current provider/model with tools disabled and a 45-second cancellation deadline. The whole serialized request is capped at 128,000 bytes, including inherited system context and other transforms. It consumes that provider's quota; no model route is changed.

OMP normally includes conversation history in an ephemeral turn. While the exact recall prompt is pending, Trainer's supported context transform supplies only that bounded prompt as conversation messages. Primary turns and unrelated side requests retain their history. Codex ephemeral turns reject output-token caps, so recall preserves the current route and relies on the context/time bounds and the host's default reply bound.

New human input cancels pending recall before showing its new feature card. Disable/reset, session changes, shutdown, and explicit display-changing controls also cancel pending recall. A late result cannot overwrite a newer hint.

If you still see no output, `/trainer status` reports the loaded version, on/off setting, global detail level, and latest presentation or recall outcome. `/trainer demo` checks the renderer, not automatic prompt coverage. An invalid global setting is shown as an availability diagnostic in the same location rather than unexplained silence.

## Development and Release

```sh
npm test
git diff --check
omp --no-extensions --extension ./index.js
```

The Node suite covers skill/command selection, exclusion of agent tools, random fallback and immediate-repeat avoidance, immediate first/busy/image/skill input, hint persistence, disabled-state restoration, global detail changes, full-width borders, Unicode/long-token wrapping, resize cleanup, and explicit recall validation/cancellation/context isolation. Completion-evidence tests were removed with the obsolete automatic evaluator.

Before submitting anything in a fresh process, confirm an enabled session shows a startup card and `/trainer status` reports a startup reminder. A saved disabled session and `OMP_TRAINER_ENABLED=0` new session must remain silent. Confirm the first real prompt replaces the startup card and that session switches clear it without generating another reminder.

Native QA must exercise a first prompt and confirm its card appears **before `agent_start`**, then stays visible through the actual primary turn and while composing. Verify the card follows instance, development-time, and worktree status rows, including after those statuses refresh. Use a long registered skill/command description: check the complete text and exact full-width borders at wide and narrow widths, then resize the same visible card and confirm reflow without a new prompt or stale rows. Verify related and random reminders and steering/follow-up submission while work is active. Backend delivery/replay and synthetic updates must not rotate the card again. Observe that ordinary prompt hints request no ephemeral turn.

With two processes already running in different projects, change global verbosity in one and confirm the next prompt in the other gets detailed or compact output as selected, never silence solely because it is quiet. Preserve disabled sessions, status-query behavior, session switching, and native control autocomplete. Use an isolated agent-directory adapter for source QA so shared-preference checks do not change personal settings.

Exercise demo and explicit recall separately, including recall while disabled and cancellation by a newer real prompt. Check exact registered invocations, complete request constraints, no automatic execution or session enabling, oversized unrelated history isolation, and unchanged model routing. A native recall requests one tool-free side turn; passive hints request none.

For source QA, load only the source extension and inspect the process's actual skill/command registry. Expose installed skills through a disposable project's discovery path when needed. Do not load both installed Trainer and a source copy.

Issue branches use `issue-<number>-<outcome>`. Open a linked draft PR, complete self-review and focused native QA, then merge into `main`. No publishing CI or npm registry release is configured: the GitHub repository is the installable artifact.

For a release, update the version and changelog on the issue branch, merge, and tag the exact merged commit as `v<version>`. Create the GitHub release from that tag. Record the resolved tag commit, then verify the remote artifact:

```sh
omp plugin uninstall omp-trainer
omp plugin install github:klondikemarlen/omp-trainer
omp plugin list
```

Reconcile the installer's resolved GitHub revision and enabled installed version with the intended tag/commit. In a **new OMP process**, exercise the changed behavior, `/trainer status`, and command/argument autocomplete. A successful source test is not released-artifact proof. If native runtime or provider access is unavailable, retain that explicit blocker rather than claiming a mock-only release pass.
