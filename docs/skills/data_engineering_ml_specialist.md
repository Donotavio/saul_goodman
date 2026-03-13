# Data Engineering and ML Specialist

## Objective

Use `skills/saul-ml` as the repo-specific specialist for data engineering and production ML decisions in Saul Goodman.

## Repo focus

- local-first feature extraction and storage
- online training and offline replay
- probability calibration and thresholding
- imbalanced evaluation and false productive control
- pseudo-label governance and active learning
- drift monitoring and rollback criteria
- explainability, privacy, and data governance

## Knowledge map

- `docs/ml_foundations/calibration.md`
- `docs/ml_foundations/active_learning.md`
- `docs/ml_foundations/imbalanced_metrics.md`
- `docs/ml_foundations/drift_monitoring.md`
- `docs/ml_foundations/leakage_validation.md`
- `docs/ml_foundations/technical_debt_ml.md`
- `docs/references/papers_reading_list.md`
- `docs/references/papers.bib`

## Operating checklist

- summarize the problem and assumptions
- inspect label sources and holdout integrity
- review leakage, calibration, drift, and imbalance risk
- prefer the smallest reliable change before more model complexity
- define rollout, monitoring, rollback, and governance impacts
