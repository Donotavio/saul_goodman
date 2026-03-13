import type {
  DomainCategory,
  DomainSuggestion,
  MlQueueReason,
  MlReviewCandidate
} from '../types.js';

export interface ReviewQueueInput {
  suggestion: DomainSuggestion;
  probability: number;
}

export interface ReviewQueueConfig {
  productiveThreshold: number;
  procrastinationThreshold: number;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const BORDERLINE_DISTANCE = 0.05;
const BORDERLINE_EPSILON = 1e-9;

export function buildReviewQueue(
  inputs: ReviewQueueInput[],
  config: ReviewQueueConfig
): MlReviewCandidate[] {
  const deduped = new Map<string, MlReviewCandidate>();

  inputs.forEach((input) => {
    const probability = clampProbability(input.probability);
    const uncertainty = 1 - Math.abs(probability - 0.5) * 2;
    const queueReason = resolveQueueReason(
      probability,
      config.productiveThreshold,
      config.procrastinationThreshold
    );
    const candidate: MlReviewCandidate = {
      domain: input.suggestion.domain,
      suggestedClassification: input.suggestion.classification,
      probability,
      uncertainty,
      confidence: input.suggestion.confidence,
      reasons: input.suggestion.reasons.slice(0, 3),
      timestamp: input.suggestion.timestamp,
      queueReason
    };
    const existing = deduped.get(candidate.domain);
    if (!existing || compareCandidates(candidate, existing) < 0) {
      deduped.set(candidate.domain, candidate);
    }
  });

  return Array.from(deduped.values())
    .sort(compareCandidates)
    .slice(0, config.limit ?? DEFAULT_LIMIT);
}

function resolveQueueReason(
  probability: number,
  productiveThreshold: number,
  procrastinationThreshold: number
): MlQueueReason {
  const productiveDistance = Math.abs(probability - productiveThreshold);
  const procrastinationDistance = Math.abs(probability - procrastinationThreshold);
  if (Math.min(productiveDistance, procrastinationDistance) <= BORDERLINE_DISTANCE + BORDERLINE_EPSILON) {
    return 'threshold_borderline';
  }
  return 'uncertainty_sampling';
}

function compareCandidates(
  left: MlReviewCandidate,
  right: MlReviewCandidate
): number {
  const reasonOrder = queueReasonRank(left.queueReason) - queueReasonRank(right.queueReason);
  if (reasonOrder !== 0) {
    return reasonOrder;
  }
  if (left.uncertainty !== right.uncertainty) {
    return right.uncertainty - left.uncertainty;
  }
  return right.timestamp - left.timestamp;
}

function queueReasonRank(reason: MlQueueReason): number {
  return reason === 'threshold_borderline' ? 0 : 1;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

export function formatSuggestedClassification(classification: DomainCategory): string {
  if (classification === 'productive') {
    return 'productive';
  }
  if (classification === 'procrastination') {
    return 'procrastination';
  }
  return 'neutral';
}
