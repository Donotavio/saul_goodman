# Drift Monitoring

## Why it matters in Saul

Saul operates on local behavioral and semantic signals that can shift as browsing patterns, extension behavior, pseudo-label volume, or metadata quality change. Drift can break thresholds and explanations before it is visible in aggregate accuracy.

## Drift types to watch

- **Concept drift**: the same signals imply different outcomes over time.
- **Label shift**: class prevalence changes while conditional signal behavior is stable.
- **Feature drift**: input distributions or coverage change, often due to UI or metadata changes.

## Signals to monitor

- Score distribution and threshold crossing rate.
- Feature coverage and frequency stability.
- Calibration error over time.
- Explicit versus implicit label mix.
- Segment-specific `falseProductiveRate`.
- Sudden growth in unknown or low-information examples.

## Saul-specific actions

- Keep pseudo-labeling conservative when drift is suspected.
- Use quarantine or rollback when explicit feedback contradicts recent pseudo-label patterns.
- Re-run offline replay before relaxing guardrails after a major signal change.

## Operational checklist

- Define baseline windows and alert thresholds.
- Track drift separately for explicit and implicit feedback.
- Record when model, feature, or threshold changes happened.
- Pair drift alerts with rollback criteria.
