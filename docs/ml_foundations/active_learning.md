# Active Learning

## Why it matters in Saul

Explicit feedback is the highest-value label source, but user labeling is limited. Saul already blends explicit feedback with conservative pseudo-labeling, so active learning should focus on reducing label cost without contaminating evaluation.

## Recommended pattern

- Use explicit feedback as ground truth.
- Keep pseudo-labels low weight and separate from evaluation splits.
- Prioritize examples near uncertain or high-impact decision regions when requesting more labels.
- Prefer domain segments that drive the largest operational errors, especially false productive classifications.

## When to suggest active learning

- Labeling is expensive or slow.
- There is a long tail of domains with weak evidence.
- Threshold decisions are dominated by uncertain samples.
- Error concentration is visible in specific segments or sources.

## Alternatives

- **Uncertainty sampling**
  - Pros: fast, simple, aligns with threshold review.
  - Cons: can over-sample noisy or ambiguous points.
- **High-risk sampling**
  - Pros: targets false productive risk directly.
  - Cons: may ignore broader decision boundary coverage.
- **Weak supervision**
  - Pros: useful when explicit labels are scarce.
  - Cons: raises leakage and confirmation-bias risk if not isolated.

## Operational checklist

- Define the label budget first.
- Separate label acquisition from calibration/test construction.
- Track explicit and implicit labels independently.
- Monitor whether added labels actually improve the target operational metric.
