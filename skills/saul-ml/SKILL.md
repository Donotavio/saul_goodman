---
name: saul-ml
description: Implement and maintain Saul Goodman's fully local auto-classification system. Use when tasks involve feature extraction from page metadata, online model updates, local model persistence, IndexedDB compatibility, suggestion confidence thresholds, cooldown rules, suggestion generation, or feedback-based training behavior.
---

# Saul ML

## Scope

- Maintain local domain auto-classification behavior.
- Keep inference, training, and persistence fully local.
- Improve suggestion quality without violating privacy constraints.

## Start Here

- Inspect ML-related modules under `src/`.
- Inspect suggestion handling in popup, background, and content flows.
- Read `docs/auto-classification.md`, `docs/chrome-extension.md`, and `docs/architecture.md`.

## System Facts

- Model: `OnlineLogisticRegression`.
- Feature vectorizer size: `65536`.
- Minimum feature frequency: `minFeatureCount=3`.
- Model persistence: IndexedDB database `sg-ml-models`.
- Model metadata: `chrome.storage.local` key `sg:ml-model-meta`.
- Classification thresholds:
  - `>= 0.60`: productive
  - `<= 0.40`: procrastination
  - otherwise: neutral

## Non-Negotiables

- Do not send metadata, features, or inferred labels to the network.
- Do not auto-modify productive or procrastination lists without explicit user action.
- Preserve accept, ignore, and manual classification flows.
- Respect suggestion cooldown and low-confidence suppression.
- Keep model behavior explainable enough for debugging.

## Workflow

1. Identify impacted ML stage: features, model update, confidence logic, or persistence.
2. Confirm privacy boundaries for any new signal.
3. Implement change with backward-compatible storage handling.
4. Validate confidence behavior, cooldown gating, and suggestion volume impact.
5. Add deterministic tests where feasible.
6. Document user-facing, privacy, and threshold impacts.

## Change Playbooks

### Feature Change

- Identify new local page signal.
- Confirm the signal does not expose sensitive content.
- Integrate with existing vectorization pipeline.
- Measure impact on confidence distribution and class balance.

### Threshold or Confidence Change

- Justify precision versus recall tradeoff.
- Validate cooldown interactions and low-confidence suppression.
- Verify popup suggestion load does not become aggressive.
- Verify no silent over-classification into user lists.

### Persistence Change

- Preserve IndexedDB schema compatibility or add migration path.
- Version metadata when schema changes.
- Keep backward compatibility for previously stored models.

## Validation Checklist

- Run `npm run build` for extension integration checks.
- Run `npm test` for logic touching suggestions, storage, or model update behavior.
- Add deterministic tests for:
  - classification threshold decisions
  - cooldown suppression
  - feedback-based update behavior
  - persistence read and write compatibility

## Output Expectations

When finishing ML changes, always include:

- user-facing impact
- privacy implications
- threshold or cooldown changes
- deterministic test coverage added or updated
