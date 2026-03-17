import {
  buildReliabilityBins,
  calculateExpectedCalibrationError,
  type CalibrationReliabilityBin
} from './calibrationMetrics.js';
import { sigmoid, clamp, clampProbability, clampWeight } from './utils.js';

export interface CalibrationSample {
  score: number;
  label: 0 | 1;
  weight?: number;
}

export interface TemperatureCalibrationState {
  method: 'temperature';
  temperature: number;
  fittedAt: number;
  sampleSize: number;
  ece: number;
}

export interface TemperatureCalibrationFitResult extends TemperatureCalibrationState {
  changed: boolean;
}

const MIN_SAMPLES = 25;

export class TemperatureScaler {
  private temperature: number;
  private fittedAt: number;
  private sampleSize: number;
  private ece: number;

  constructor(state?: Partial<TemperatureCalibrationState>) {
    this.temperature = normalizeTemperature(state?.temperature);
    this.fittedAt = Number.isFinite(state?.fittedAt) ? (state?.fittedAt as number) : 0;
    this.sampleSize = Number.isFinite(state?.sampleSize) ? (state?.sampleSize as number) : 0;
    this.ece = Number.isFinite(state?.ece) ? (state?.ece as number) : 0;
  }

  isFitted(): boolean {
    return this.fittedAt > 0;
  }

  transform(score: number): number {
    return sigmoid(score / normalizeTemperature(this.temperature));
  }

  fit(samples: CalibrationSample[]): TemperatureCalibrationFitResult {
    const usable = samples
      .filter((sample) => Number.isFinite(sample.score))
      .map((sample) => ({
        score: sample.score,
        label: sample.label,
        weight: clampWeight(sample.weight)
      }));

    if (usable.length < MIN_SAMPLES) {
      return this.getState(false);
    }

    let logTemperature = Math.log(normalizeTemperature(this.temperature));
    const learningRate = 0.02;
    const regularization = 1e-4;
    const epochs = 400;

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      let gradient = 0;
      let totalWeight = 0;

      for (let i = 0; i < usable.length; i += 1) {
        const sample = usable[i];
        const temperature = Math.exp(logTemperature);
        const scaled = sample.score / temperature;
        const probability = sigmoid(scaled);
        gradient += (probability - sample.label) * (-scaled) * sample.weight;
        totalWeight += sample.weight;
      }

      const safeWeight = totalWeight > 0 ? totalWeight : usable.length;
      gradient = gradient / safeWeight + regularization * logTemperature;
      logTemperature -= learningRate * gradient;
      logTemperature = clamp(logTemperature, Math.log(0.05), Math.log(20));
    }

    this.temperature = Math.exp(logTemperature);
    this.fittedAt = Date.now();
    this.sampleSize = usable.length;
    this.ece = calculateExpectedCalibrationError(
      usable.map((sample) => this.transform(sample.score)),
      usable.map((sample) => sample.label),
      10
    );

    return this.getState(true);
  }

  getState(changed = false): TemperatureCalibrationFitResult {
    return {
      method: 'temperature',
      temperature: this.temperature,
      fittedAt: this.fittedAt,
      sampleSize: this.sampleSize,
      ece: this.ece,
      changed
    };
  }

  getReliabilityBins(samples: CalibrationSample[], bins = 10): CalibrationReliabilityBin[] {
    const usable = samples.filter((sample) => Number.isFinite(sample.score));
    return buildReliabilityBins(
      usable.map((sample) => this.transform(sample.score)),
      usable.map((sample) => sample.label),
      bins
    );
  }
}

function normalizeTemperature(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return clamp(value as number, 0.05, 20);
}

export { calculateExpectedCalibrationError, buildReliabilityBins, clampProbability };
