---
name: saul-ml
description: Guide data engineering and production ML decisions for Saul Goodman's local classification stack. Use when tasks involve local feature extraction, offline replay datasets, online training behavior, probability calibration, thresholding, active learning, imbalanced evaluation, data leakage prevention, drift monitoring, explainability, model persistence, or ML governance.
user-invocable: true
allowed-tools:
  - Bash(npm test:*)
  - Bash(npm run ml:replay:*)
  - Bash(npx tsx:*)
  - Read
  - Edit
  - Grep
  - Glob
paths:
  - src/shared/ml/**
  - src/background/ml-engine.ts
  - tools/ml_replay/**
  - docs/auto-classification.md
  - docs/ml_foundations/**
  - docs/skills/data_engineering_ml_specialist.md
  - src/tests/ml-*.test.ts
---

## Estado atual do ML

Arquivos ML:
!`find src/shared/ml -name '*.ts' 2>/dev/null | sort`

Testes ML:
!`find src/tests -name 'ml-*.test.ts' 2>/dev/null | sort`

# Saul ML

## Scope

- Guide architecture and implementation decisions for Saul's local-first ML system.
- Improve training, evaluation, and monitoring before increasing model complexity.
- Keep privacy, governance, and operational reliability explicit in every ML change.

## Start Here

- Inspect `src/background/ml-engine.ts` and `src/shared/ml/`.
- Read `docs/auto-classification.md` and `docs/architecture.md`.
- Read `docs/skills/data_engineering_ml_specialist.md` for the repo-specific operating model.
- Load only the foundation note that matches the task:
  - calibration: `docs/ml_foundations/calibration.md`
  - active learning: `docs/ml_foundations/active_learning.md`
  - imbalanced evaluation: `docs/ml_foundations/imbalanced_metrics.md`
  - drift and shift: `docs/ml_foundations/drift_monitoring.md`
  - leakage checks: `docs/ml_foundations/leakage_validation.md`
  - ML debt and maintainability: `docs/ml_foundations/technical_debt_ml.md`
  - reading list: `docs/references/papers_reading_list.md`

## Non-Negotiables

- Check data leakage risk before discussing metric gains.
- Prefer data quality, label quality, and split quality improvements before more complex models.
- For imbalanced datasets, prioritize PR-AUC, thresholded precision/recall, and segment-level metrics when the dataset supports them.
- Calibrate probabilities before changing thresholds when scores drive product behavior.
- Keep pseudo-labels lower trust than explicit labels and out of evaluation holdouts.
- Require versioning for datasets, experiments, features, and model state when production behavior changes.
- Keep inference and training local unless the user explicitly changes product boundaries.
- Consider performance, scalability, cost, maintenance, reliability, governance, and LGPD/GDPR impact.

## Workflow

1. Summarize the problem, constraints, and missing assumptions.
2. Inspect the current data path, feature path, labels, thresholds, and storage contracts.
3. Review leakage, imbalance, calibration, drift, and observability risk.
4. Choose the smallest change that improves operational metrics and maintainability.
5. Define validation with offline replay, deterministic tests, and segment-level checks.
6. Report rollout, rollback, monitoring, and governance implications.

## Playbooks

### Training and Evaluation

- Use `npm run ml:replay -- --input ...` when a dataset is available.
- Report macro-F1, `falseProductiveRate`, `precisionProductive`, ECE, and Brier for Saul-specific model changes.
- Add PR-AUC, recall, or threshold sweeps when class imbalance or label cost is central to the decision.
- Verify metrics by segment when behavior differs by source, domain family, or feedback type.

### Calibration and Thresholds

- Inspect score distributions before changing thresholds.
- Refit or re-evaluate calibration whenever score behavior changes materially.
- Keep threshold changes tied to an explicit product tradeoff.

### Labeling and Active Learning

- Treat explicit user feedback as the highest-trust label source.
- Keep pseudo-labels conservative, low-weight, and quarantined when contradicted by explicit feedback.
- Suggest active learning or weak supervision when labeling cost is high and uncertainty is concentrated.

### Drift and Operations

- Monitor score stability, feature coverage, calibration error, label mix, and false productive regressions.
- Define rollback triggers before relaxing guardrails or increasing pseudo-label throughput.
- Call out failure modes from silent schema changes, stale thresholds, and feedback loops.

## Validation Checklist

- Run `npm run build` when touching integrated extension behavior.
- Run `npm test` when changing training, calibration, persistence, or suggestion logic.
- Run `npm run ml:replay -- --input ...` for offline dataset evaluation when dataset-backed claims are made.
- Confirm holdout integrity, threshold rationale, and drift/leakage checks in the final output.

## Output Expectations

Always include:

- objective problem summary
- assumptions and missing data
- recommended solution with alternatives and tradeoffs
- validation and monitoring checklist
- privacy, governance, and operational impact
