# Changelog

## 0.5.0

### Added
- Session-persistent `/trainer verbose` and `/trainer quiet` controls, with native autocomplete and the active mode in status.
- Verbose feedback for completed assessments with no supported tip, ineligible evidence, unconfirmed completion, and assessment failures.
- Optional task-relevant capability reminders that teach live tools, commands, or skills without claiming the user's original request was wrong.

### Changed
- Default to verbose coaching so users can observe Trainer during normal use; `OMP_TRAINER_MODE=quiet` selects the default for new sessions.
- Give verbose tips a short notification directing attention to the existing below-editor hint, without duplicating its full text.
- Quiet mode retains avoidable-effort-only hints without automatic notifications. Both modes share the existing inference frequency, completion checks, context/time limits, cancellation, and replay protection.

## 0.4.1

### Fixed
- Keep ordinary recalled command invocations separate from request prose instead of inventing undocumented arguments. Skill prompts still combine their registered invocation with the complete original request.

## 0.4.0

### Added
- `/trainer recall <request>` finds one relevant live tool, command, or skill without executing the request, including while automatic coaching is off.
- Recall hints teach the exact registered invocation with the original request and its constraints preserved verbatim, without retaining hint history or recording a completed-work assessment.

### Changed
- Distinguish installed skills from ordinary commands in capability citations and retain the existing avoidable-effort threshold for automatic coaching.
- Share context/time bounds, session isolation, and cancellation across automatic assessment and explicit recall.

## 0.3.0

### Added
- `/trainer demo` immediately displays an explicitly labelled preview through the same below-editor renderer as automatic coaching.
- Demo autocomplete and cancellation of pending inference, without requesting a model, recording a false assessment, starting primary work, or changing the coaching on/off state.

## 0.2.0

### Changed
- Present coaching as a labelled `Trainer hint:` below the editor instead of an unlabelled notification.
- Keep hints visible while composing or checking status; clear them on new work, disable/reset, session changes, and shutdown without replaying old hints.

## 0.1.1

### Fixed
- Keep unrelated session history out of Trainer's bounded assessment request, preventing large prior output from silently exhausting its context budget.
- Preserve primary conversation history and unrelated side requests while retaining existing model routing, completion checks, cancellation, and replay protection.

## 0.1.0

### Added
- Installable OMP Trainer extension with one grounded, post-completion user-coaching notification when a supported lower-effort alternative exists.
- Session-persistent `/trainer on`, `/trainer off`, and `/trainer status` controls with native argument autocomplete.
- Conservative completion assessment, bounded active-session evidence, replay suppression, and cancellation when new work starts.

### Boundaries
- No advisor registration, automatic workflow execution, guidance edits, ticket filing, cross-session archive scan, or model/provider changes.
- Inference uses the current configured model and consumes its provider quota. Unsupported or failed side turns stay silent and expose a status diagnostic.
