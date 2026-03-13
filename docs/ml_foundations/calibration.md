# Calibration

## Why it matters in Saul

Saul uses predicted probabilities to decide whether a domain suggestion becomes `productive`, `neutral`, or `procrastination`. If the probabilities are poorly calibrated, threshold changes and guardrail decisions become misleading even when rank-ordering is acceptable.

## What to check

- Compare discrimination metrics and calibration metrics separately.
- Use ECE and Brier alongside domain-specific error rates such as `falseProductiveRate`.
- Re-evaluate calibration whenever:
  - model architecture changes
  - feature families change
  - sampling policy changes
  - label mix changes materially
- Prefer explicit-label calibration splits and keep test data disjoint.

## Saul-specific guidance

- Current stack uses `TemperatureScaler` over raw model score.
- Threshold changes should reference calibrated probabilities, not raw scores.
- If calibration data is small, keep prior calibration state rather than overfitting to a tiny calibration split.
- Report how calibration affects operational thresholds and suggestion volume.
- Keep `train`, `calibration`, and `test` counts visible in replay reports.

## Failure modes

- Using pseudo-labels in calibration or test partitions inflates confidence.
- Recalibrating on a distribution that no longer matches production leads to unstable thresholds.
- Treating ECE improvement as sufficient while `falseProductiveRate` worsens.

## Operational checklist

- Verify calibration/test composition and label source.
- Check ECE and Brier before and after calibration.
- Confirm threshold bands still reflect product intent.
- Document when calibration was last refit and with how many samples.
