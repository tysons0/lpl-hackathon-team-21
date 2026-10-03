# SKILL-12: AWS Observability, Operations & Cost Guardrails (`aws_observability_guardrails_ops`)

## Objective
Standardize operations, logging, distributed tracing, alerting, and cost control mechanisms across AWS applications for coding agents.

---

## Technical Stack
- **Logging & Metrics:** Amazon CloudWatch Logs, CloudWatch Embedded Metric Format (EMF)
- **Distributed Tracing:** AWS X-Ray
- **Cost Controls:** AWS Budgets, CloudWatch Anomaly Detection
- **Infrastructure:** AWS CDK v2 (Python)

---

## Python EMF CloudWatch Logger (`logger_emf.py`)

```python
import json
import time
from typing import Dict, Any

def emit_emf_metric(
    namespace: str,
    metric_name: str,
    value: float,
    unit: str = "Count",
    dimensions: Dict[str, str] = None
):
    if dimensions is None:
        dimensions = {"Environment": "Production"}

    dimension_keys = list(dimensions.keys())

    emf_payload = {
        "_aws": {
            "Timestamp": int(time.time() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": namespace,
                    "Dimensions": [dimension_keys],
                    "Metrics": [{"Name": metric_name, "Unit": unit}]
                }
            ]
        },
        **dimensions,
        metric_name: value
    }

    print(json.dumps(emf_payload))

if __name__ == "__main__":
    emit_emf_metric("WealthMatching", "MatchScoreCalculationLatency", 142.5, "Milliseconds")
```

---

## CDK Observability & Cost Guardrail Construct (`observability_stack.py`)

```python
from aws_cdk import (
    Stack,
    aws_cloudwatch as cw,
    aws_budgets as budgets,
)
from constructs import Construct

class ObservabilityStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        latency_metric = cw.Metric(
            namespace="WealthMatching",
            metric_name="MatchScoreCalculationLatency",
            statistic="p95"
        )

        cw.Alarm(
            self, "HighLatencyAlarm",
            metric=latency_metric,
            threshold=2000,
            evaluation_periods=2,
            alarm_description="Alarm if p95 matching latency exceeds 2 seconds"
        )

        budgets.CfnBudget(
            self, "MonthlyCostBudget",
            budget=budgets.CfnBudget.BudgetDataProperty(
                budget_type="COST",
                time_unit="MONTHLY",
                budget_limit=budgets.CfnBudget.SpendProperty(amount=500, unit="USD")
            ),
            notifications_with_subscribers=[
                budgets.CfnBudget.NotificationWithSubscribersProperty(
                    notification=budgets.CfnBudget.NotificationProperty(
                        comparison_operator="GREATER_THAN",
                        notification_type="ACTUAL",
                        threshold=80,
                        threshold_type="PERCENTAGE"
                    ),
                    subscribers=[
                        budgets.CfnBudget.SubscriberProperty(
                            address="alerts@example.com",
                            subscription_type="EMAIL"
                        )
                    ]
                )
            ]
        )
```
