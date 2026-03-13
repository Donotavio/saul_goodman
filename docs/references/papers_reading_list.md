# ML Systems Reading List

## Priority High

- **Guo et al. (2017), On Calibration of Modern Neural Networks**
  - Use for thresholding and calibrated probabilities in user-facing decisions.
- **Settles (2009), Active Learning Literature Survey**
  - Use when labeling is expensive and feedback loops need prioritization.
- **Niculescu-Mizil and Caruana (2005), Predicting Good Probabilities with Supervised Learning**
  - Use to compare calibration approaches and ranking versus probability quality.
- **Saito and Rehmsmeier (2015), The Precision-Recall Plot Is More Informative than the ROC Plot When Evaluating Binary Classifiers on Imbalanced Datasets**
  - Use when class imbalance makes ROC-AUC misleading.
- **Kaufman et al. (2012), Leakage in Data Mining: Formulation, Detection, and Avoidance**
  - Use before trusting offline gains.
- **Sculley et al. (2015), Hidden Technical Debt in Machine Learning Systems**
  - Use for architecture, observability, and ML debt review.

## Priority Medium

- **Platt (1999), Probabilistic Outputs for Support Vector Machines**
  - Use for practical probability calibration intuition.
- **Zadrozny and Elkan (2001, 2002)**
  - Use for calibration under class imbalance and multiclass probability framing.
- **Gama et al. (2014), A Survey on Concept Drift Adaptation**
  - Use for drift taxonomy and mitigation choices.
- **Ribeiro et al. (2016), Why Should I Trust You?**
  - Use for local explainability tradeoffs.
- **Lundberg and Lee (2017), A Unified Approach to Interpreting Model Predictions**
  - Use for additive explanation framing and constraints.
- **Chawla et al. (2002), SMOTE**
  - Use with care when exploring imbalance mitigation; do not default to resampling without first checking label quality and threshold tuning.

## How to use in Saul

- Start with the high-priority set for any calibration, evaluation, leakage, or system-governance decision.
- Use the medium-priority set when the task specifically needs explanation methods, drift adaptation, or imbalance handling alternatives.
- Prefer operational conclusions over paper summary. Always connect the paper to:
  - local-first privacy constraints
  - false productive risk
  - holdout integrity
  - maintainability of the extension
