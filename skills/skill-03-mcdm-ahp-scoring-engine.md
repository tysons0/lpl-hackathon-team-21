# Coding Agent Skill Specification: SKILL-03

> **Target Platform:** AWS (Serverless / Managed AI)
> **Runtime Language:** Python 3.11+
> **Architecture Source:** LPL Financial Wealth Matching Analysis & Fintech LLM Engine Research

---

# SKILL-03: Multi-Criteria Decision Making (AHP) Scoring Agent (`mcdm_ahp_scoring_engine`)


### Role & Purpose
Act as a quantitative financial software engineer generating an Analytic Hierarchy Process (AHP) scoring service. This service constructs Saaty 1-9 pairwise comparison matrices, computes principal eigenvalues/eigenvectors, verifies the Consistency Ratio ($CR < 0.10$), executes multi-agent debate for consensus if needed, and outputs deterministic candidate ranking scores.

### AWS & Python Architecture
- **Compute:** AWS Lambda or Step Functions for multi-agent negotiation workflow.
- **Math Engine:** Python `numpy` and `scipy.linalg`.
- **Virtual Expert Prompting:** Amazon Bedrock (Claude 3.5 Sonnet / Llama 3 70B).

### Core AHP Mathematical Algorithm (Python)

```python
import numpy as np
from pydantic import BaseModel, Field

# Saaty Random Index (RI) lookup table
RANDOM_INDEX = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41}

class AHPMatrixEvaluator:
    @staticmethod
    def calculate_weights_and_consistency(matrix: np.ndarray):
        """Calculates criteria weight vector, Consistency Index (CI), Consistency Ratio (CR)."""
        n = matrix.shape[0]
        eigenvalues, eigenvectors = np.linalg.eig(matrix)
        max_index = np.argmax(np.real(eigenvalues))
        lambda_max = np.real(eigenvalues[max_index])
        
        principal_vector = np.real(eigenvectors[:, max_index])
        weights = principal_vector / np.sum(principal_vector)
        
        ci = (lambda_max - n) / (n - 1) if n > 1 else 0.0
        ri = RANDOM_INDEX.get(n, 1.41)
        cr = ci / ri if ri > 0 else 0.0
        
        is_consistent = cr <= 0.10
        return weights, ci, cr, is_consistent

    @staticmethod
    def aggregate_multi_agent_consensus(matrices: list) -> np.ndarray:
        """Geometric Mean Aggregation across multiple LLM agents."""
        stacked = np.stack(matrices, axis=0)
        E = len(matrices)
        aggregated = np.prod(stacked, axis=0) ** (1.0 / E)
        return aggregated
```

### Safety & Compliance Guardrails
1. **Self-Correction Trigger:** If $CR > 0.10$, the system automatically triggers a Bedrock API re-prompting loop detailing the logical inconsistency until $CR \le 0.10$.
2. **Auditability:** Log the raw Saaty matrix, calculated $\lambda_{max}$, $CI$, and $CR$ into CloudWatch/DynamoDB for compliance review.
