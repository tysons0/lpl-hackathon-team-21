# Coding Agent Skill Specification: SKILL-06

> **Target Platform:** AWS (Serverless / Managed AI)
> **Runtime Language:** Python 3.11+
> **Architecture Source:** LPL Financial Wealth Matching Analysis & Fintech LLM Engine Research

---

# SKILL-06: Portfolio Optimization & Signal Harmonizer (`portfolio_opt_harmonizer`)


### Role & Purpose
Act as a quantitative developer building a portfolio optimization service. This agent parses unstructured LLM financial signals, maps them into Black-Litterman prior views, and solves deterministic mean-variance allocations ($\max_w w^T r - \lambda w^T \Sigma w$) using Python convex optimization packages (`cvxpy`, `PyPortfolioOpt`).

### AWS & Python Architecture
- **Compute:** AWS Batch or ECS Fargate Task (CPU-intensive matrix calculations).
- **Mathematical Solver:** `cvxpy` / `PyPortfolioOpt` / `scipy.optimize`.
- **Signal Input:** Bedrock JSON tool calls providing expected return vectors ($r$) and risk aversion ($\lambda$).

### Python Black-Litterman Convex Optimization Engine

```python
import numpy as np
import cvxpy as cp
from pydantic import BaseModel

class PortfolioOptimizationRequest(BaseModel):
    asset_names: list
    expected_returns: list  # r vector
    covariance_matrix: list  # Sigma matrix
    risk_aversion_lambda: float  # Lambda parameter

class BlackLittermanSolver:
    @staticmethod
    def solve_constrained_mvo(req: PortfolioOptimizationRequest) -> dict:
        r = np.array(req.expected_returns)
        Sigma = np.array(req.covariance_matrix)
        lmbda = req.risk_aversion_lambda
        n = len(r)

        w = cp.Variable(n)
        portfolio_return = r @ w
        portfolio_risk = cp.quad_form(w, Sigma)
        objective = cp.Maximize(portfolio_return - lmbda * portfolio_risk)

        constraints = [cp.sum(w) == 1.0, w >= 0.0]

        problem = cp.Problem(objective, constraints)
        problem.solve()

        if problem.status not in ['optimal', 'optimal_inaccurate']:
            raise ValueError(f'Portfolio optimization failed: {problem.status}')

        weights = np.clip(w.value, 0, 1.0)
        weights /= np.sum(weights)
        return {asset: float(weight) for asset, weight in zip(req.asset_names, weights)}
```

### Safety & Compliance Guardrails
1. **Bounded Autonomy:** The LLM is strictly used as an external probabilistic signal generator. Trade execution logic and exact portfolio weights are permanently delegated to deterministic solvers (`cvxpy`).
2. **Hard Constraints:** Enforce mandatory long-only bounds ($w_i \ge 0$) and full allocation ($\sum w_i = 1.0$) at solver level.

---

## Instructions for Coding Agents Executing These Skills

When initiating code generation for this architecture:
1. **Load Target Skill:** Specify the `SKILL-ID` matching your immediate task module (e.g., `behavioral_intake_crs`).
2. **Enforce AWS Infrastructure Patterns:** Use AWS CDK v2 or Terraform scripts alongside Python code for serverless resource definition.
3. **Validate Type Safety:** Implement `pydantic` v2 models for all inter-service schemas.
4. **Enforce Guardrails:** Ensure every generated module includes the mandated compliance and anti-hallucination checks outlined in the respective skill definition.
