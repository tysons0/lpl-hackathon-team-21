# SKILL-11: AWS Containerized Batch Compute Sub-App (`aws_containerized_batch_compute`)

## Objective
Provide coding agents with specifications to construct containerized high-performance computing pipelines using AWS Batch, ECS Fargate, ECR, and S3 for heavy quantitative tasks (e.g., Black-Litterman Mean-Variance Optimization, risk simulation).

---

## Architecture
```
  [ Trigger Event / Lambda ]
             │
             ▼
  [ AWS Batch Job Queue ]
             │
             ▼
  [ AWS ECS Fargate Compute Environment ]
             │
             ├──► [ Pull Docker Image from Amazon ECR ]
             ├──► [ Fetch Matrix Inputs from S3 ]
             ├──► [ Run cvxpy / scipy Optimization Task ]
             └──► [ Write Output Allocations to S3 ]
```

---

## Technical Stack
- **Container Registry:** Amazon ECR
- **Compute Engine:** AWS Batch on ECS Fargate / Fargate Spot
- **Libraries:** Python 3.12, `cvxpy`, `PyPortfolioOpt`, `scipy`, `pandas`, `boto3`
- **Storage:** Amazon S3

---

## Container Specification (`Dockerfile`)

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends     build-essential     gfortran     libopenblas-dev     && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ /app/src/

ENTRYPOINT ["python", "-m", "src.portfolio_runner"]
```

---

## Python Batch Job Task (`src/portfolio_runner.py`)

```python
import os
import boto3
import json
import numpy as np
import cvxpy as cp

def run_portfolio_optimization():
    job_id = os.getenv("AWS_BATCH_JOB_ID", "local-test")
    input_s3_uri = os.getenv("INPUT_S3_URI")
    output_s3_uri = os.getenv("OUTPUT_S3_URI")

    print(f"Starting Batch Job {job_id}")

    n = 5
    returns = np.array([0.12, 0.10, 0.08, 0.06, 0.04])
    cov_matrix = np.eye(n) * 0.05

    w = cp.Variable(n)
    gamma = cp.Parameter(nonneg=True, value=1.0)
    objective = cp.Maximize(returns @ w - gamma * cp.quad_form(w, cov_matrix))
    constraints = [cp.sum(w) == 1, w >= 0]

    problem = cp.Problem(objective, constraints)
    problem.solve()

    weights = w.value.tolist()
    print("Optimized Portfolio Weights:", weights)

    if output_s3_uri:
        s3 = boto3.client("s3")
        bucket = output_s3_uri.split("/")[2]
        key = "/".join(output_s3_uri.split("/")[3:])
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps({"job_id": job_id, "weights": weights})
        )

if __name__ == "__main__":
    run_portfolio_optimization()
```
