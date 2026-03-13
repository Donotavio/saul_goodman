# Imbalanced Metrics

## Why it matters in Saul

Saul's most costly mistake is usually a false productive classification, not a small shift in aggregate accuracy. That makes balanced operational reporting more important than a single headline metric.

## Preferred metrics

- PR-AUC when probability scores are available and positives are rare or costly.
- Precision and recall at chosen thresholds.
- Segment-level precision and recall by source, domain family, or feedback type.
- `falseProductiveRate` for Saul-specific regression tracking.
- Macro-F1 when class balance across productive/procrastination matters.

## What to avoid

- Relying on accuracy alone.
- Comparing threshold changes without looking at class prevalence.
- Reporting only averaged metrics when one segment drives most risk.

## Saul-specific guidance

- Pair `falseProductiveRate` with `precisionProductive`.
- If a change improves macro-F1 but increases false productive errors materially, treat it as suspect.
- Threshold reviews should include confusion counts, not only rates.

## Operational checklist

- Report class distribution for train, calibration, and test.
- Show thresholded precision/recall for the chosen operating point.
- Compare metrics by segment when domains or label sources are skewed.
- Keep the business cost of each error type explicit.
