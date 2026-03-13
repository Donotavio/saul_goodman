# Leakage Validation

## Why it matters in Saul

Leakage can create fake gains in offline evaluation and cause guardrails to relax too early. In Saul, leakage risk appears not only from future data but also from pseudo-label feedback loops and improperly mixed `train/calibration/test` partitions.

## Common leakage patterns

- Using pseudo-labels in evaluation or calibration partitions.
- Building calibration or threshold policies from the same data used to justify performance claims.
- Including features that are unavailable at real inference time.
- Mixing future feedback into earlier training decisions.
- Querying only a truncated global sample when checking domain-specific contradictions.

## Saul-specific rules

- Keep calibration and test examples limited to explicit labels unless the evaluation purpose says otherwise.
- Use deterministic temporal or seeded splits and document which one was used.
- Ensure every feature in replay is available from the same observation point as production inference.
- Treat derived signals from future user actions as invalid for inference-time evaluation.

## What to verify before trusting a metric gain

- Train, calibration, and test separation logic.
- Label source isolation.
- Timestamp handling and ordering assumptions.
- No silent fallback from missing fields into optimistic defaults.

## Operational checklist

- Document split strategy and seed.
- Record label source composition in each dataset partition.
- Verify calibration/test partitions have no training-only artifacts.
- Re-check leakage whenever sampling or replay tooling changes.
