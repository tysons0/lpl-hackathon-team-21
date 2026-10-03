# SKILL-09: AWS Serverless Microservice Deployment (`aws_serverless_microservice_deploy`)

## Objective
Define the blueprint for coding agents to build, deploy, and execute high-performance, Python-based serverless microservices using AWS Lambda, API Gateway (HTTP/REST), DynamoDB (Single-Table Design), and AWS Lambda Powertools.

---

## Sub-App Architecture
```
  [ Client Request ]
         │
         ▼
  [ Amazon API Gateway ] ──► (JWT / Cognito Authorizer)
         │
         ▼
  [ AWS Lambda (FastAPI / Powertools) ]
         │
         ├──► [ DynamoDB (Single-Table GSI) ]
         └──► [ AWS CloudWatch (EMF Metrics + X-Ray Traces) ]
```

---

## Technical Stack
- **Compute:** AWS Lambda (Python 3.12 runtime, arm64 Graviton)
- **API Router:** AWS API Gateway HTTP API v2 / REST API
- **Framework:** FastAPI with `mangum` adapter or AWS Lambda Powertools
- **Database:** Amazon DynamoDB (Pay-Per-Request, Single-Table Schema)
- **Observability:** AWS Lambda Powertools (`aws-lambda-powertools`)

---

## Python Serverless Handler (`handler.py`)

```python
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, Response
from aws_lambda_powertools.metrics import MetricUnit
import boto3
import os
from pydantic import BaseModel, Field

logger = Logger(service="WealthMatchingService")
tracer = Tracer(service="WealthMatchingService")
metrics = Metrics(namespace="WealthMatching", service="MatchingAPI")

app = APIGatewayHttpResolver()
dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.getenv("DYNAMODB_TABLE_NAME", "WealthMatchingTable")
table = dynamodb.Table(TABLE_NAME)

class IntakeSubmissionRequest(BaseModel):
    user_id: str = Field(..., description="Anonymous session UUID")
    risk_profile: str = Field(..., description="Aggressive, Moderate, Conservative")
    investment_horizon_years: int = Field(..., ge=1, le=50)

@app.post("/v1/intake")
@tracer.capture_method
def submit_intake():
    body: dict = app.current_event.json_body
    payload = IntakeSubmissionRequest(**body)

    logger.info("Processing intake submission", extra={"user_id": payload.user_id})

    item = {
        "PK": f"USER#{payload.user_id}",
        "SK": "INTAKE#LATEST",
        "RiskProfile": payload.risk_profile,
        "HorizonYears": payload.investment_horizon_years,
        "Status": "COMPLETED"
    }
    table.put_item(Item=item)

    metrics.add_metric(name="IntakeSubmissions", unit=MetricUnit.Count, value=1)

    return Response(
        status_code=201,
        content_type="application/json",
        body={"status": "success", "user_id": payload.user_id}
    )

@logger.inject_lambda_context(correlation_id_path=APIGatewayHttpResolver.correlation_id_path)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event, context):
    return app.resolve(event, context)
```

---

## CDK Stack Definition (`serverless_stack.py`)

```python
from aws_cdk import (
    Stack,
    Duration,
    aws_lambda as _lambda,
    aws_apigatewayv2 as apigw2,
    aws_apigatewayv2_integrations as integrations,
    aws_dynamodb as dynamodb,
)
from constructs import Construct

class ServerlessMicroserviceStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        self.table = dynamodb.Table(
            self, "SingleTableDB",
            partition_key=dynamodb.Attribute(name="PK", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="SK", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True
        )

        fn = _lambda.Function(
            self, "ApiHandler",
            runtime=_lambda.Runtime.PYTHON_3_12,
            architecture=_lambda.Architecture.ARM_64,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset("src/"),
            timeout=Duration.seconds(29),
            memory_size=512,
            environment={
                "DYNAMODB_TABLE_NAME": self.table.table_name,
                "POWERTOOLS_SERVICE_NAME": "WealthMatchingService"
            }
        )

        self.table.grant_read_write_data(fn)

        http_api = apigw2.HttpApi(self, "MatchingHttpApi", api_name="WealthMatchingAPI")
        http_api.add_routes(
            path="/v1/intake",
            methods=[apigw2.HttpMethod.POST],
            integration=integrations.HttpLambdaIntegration("IntakeIntegration", fn)
        )
```
