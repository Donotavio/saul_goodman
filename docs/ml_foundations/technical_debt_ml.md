# Technical Debt in ML Systems

## Why it matters in Saul

ML debt in Saul is more likely to come from data contracts, evaluation shortcuts, silent state migrations, and feedback loops than from raw model size. Small local systems accumulate debt quickly when observability and reproducibility are weak.

## Typical debt sources

- Hidden coupling between feature extraction, thresholds, and UI explanations.
- Storage migrations without clear compatibility tests.
- Offline replay tooling that does not match production thresholds or preprocessing.
- Pseudo-label behavior that grows without explicit rollback criteria.
- Missing versioning for datasets, features, and experiments.

## Saul-specific guidance

- Keep `docs/auto-classification.md` and `docs/architecture.md` aligned with behavior.
- Prefer deterministic tests for migrations, calibration, replay, and validation gate logic.
- Version stateful model behavior explicitly when persistence changes.
- Keep model explanations human-readable enough to debug threshold incidents.

## Operational checklist

- Record the exact dataset, seed, and config behind every evaluation claim.
- Add tests before changing storage or gating logic.
- Make rollback paths explicit for guardrail or pseudo-label policy changes.
- Cleanly separate experimental logic from user-visible behavior.
