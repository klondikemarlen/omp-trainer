# Changelog

## 0.1.0

### Added
- Installable OMP Trainer extension with one grounded, post-completion user-coaching notification when a supported lower-effort alternative exists.
- Session-persistent `/trainer on`, `/trainer off`, and `/trainer status` controls with native argument autocomplete.
- Conservative completion assessment, bounded active-session evidence, replay suppression, and cancellation when new work starts.

### Boundaries
- No advisor registration, automatic workflow execution, guidance edits, ticket filing, cross-session archive scan, or model/provider changes.
- Inference uses the current configured model and consumes its provider quota. Unsupported or failed side turns stay silent and expose a status diagnostic.
