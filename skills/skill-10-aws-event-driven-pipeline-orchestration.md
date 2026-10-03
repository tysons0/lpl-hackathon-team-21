# SKILL-10: AWS Event-Driven Pipeline & Step Functions Orchestration (`aws_event_driven_pipeline_orchestration`)

## Objective
Guide coding agents to provision and run asynchronous, event-driven pipelines using AWS EventBridge, Amazon SQS, Amazon SNS, and AWS Step Functions state machines for multi-stage AI reasoning workflows.

---

## Architecture
```
  [ Application Event ]
            │
            ▼
  [ AWS EventBridge Bus ] ──► (Rule: DetailType == "ClientConsultationBooked")
            │
            ├──► [ SQS Queue (DLQ attached) ] ──► [ Consumer Lambda ]
            │
            └──► [ AWS Step Functions ]
                     │
                     ├──► [ Stage 1: RAG Retrieval ]
                     ├──► [ Stage 2: MCDM Scoring ]
                     └──► [ Stage 3: CRM Push ]
```

---

## Technical Stack
- **Event Router:** AWS EventBridge (Custom Event Bus + Schema Registry)
- **Queuing & Buffering:** Amazon SQS with Dead-Letter Queues (DLQ)
- **Orchestration:** AWS Step Functions (Standard/Express State Machine)
- **SDK:** Python `boto3`

---

## Python Event Publisher (`event_publisher.py`)

```python
import boto3
import json
import uuid
from datetime import datetime

class WealthEventPublisher:
    def __init__(self, bus_name: str = "WealthMatchingEventBus"):
        self.client = boto3.client("events")
        self.bus_name = bus_name

    def publish_consultation_booked(self, user_id: str, advisor_id: str, slot: str):
        event_payload = {
            "eventId": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "userId": user_id,
            "advisorId": advisor_id,
            "scheduledSlot": slot
        }

        response = self.client.put_events(
            Entries=[
                {
                    "Source": "com.lpl.wealthmatching.booking",
                    "DetailType": "ClientConsultationBooked",
                    "Detail": json.dumps(event_payload),
                    "EventBusName": self.bus_name
                }
            ]
        )
        return response

if __name__ == "__main__":
    publisher = WealthEventPublisher()
    res = publisher.publish_consultation_booked("usr-881", "adv-442", "2026-10-15T14:00:00Z")
    print("Event Published:", res)
```

---

## CDK Step Functions Definition (`pipeline_stack.py`)

```python
from aws_cdk import (
    Stack,
    Duration,
    aws_stepfunctions as sfn,
    aws_stepfunctions_tasks as tasks,
    aws_lambda as _lambda,
)
from constructs import Construct

class PipelineOrchestrationStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        rag_lambda = _lambda.Function.from_function_name(self, "RagFn", "rag-retrieval-service")
        mcdm_lambda = _lambda.Function.from_function_name(self, "McdmFn", "mcdm-scoring-service")

        task1 = tasks.LambdaInvoke(self, "InvokeRAG", lambda_function=rag_lambda, result_path="$.rag_output")
        task2 = tasks.LambdaInvoke(self, "InvokeMCDM", lambda_function=mcdm_lambda, result_path="$.mcdm_output")

        definition = task1.next(
            task2.add_retry(
                errors=["States.ALL"],
                interval=Duration.seconds(2),
                max_attempts=3,
                backoff_rate=2.0
            )
        )

        state_machine = sfn.StateMachine(
            self, "MatchingPipelineStateMachine",
            definition_body=sfn.DefinitionBody.from_chain_definition(definition),
            state_machine_type=sfn.StateMachineType.STANDARD
        )
```
