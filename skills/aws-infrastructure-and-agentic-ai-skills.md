# AWS Infrastructure & Agentic AI Coding Agent Skill Suite

This master document combines all **12 Agentic Skills** for building, deploying, and operating wealth management AI matching engines and AWS infrastructure using Python and AWS CDK.

---

## Complete Skill Matrix Index

### Domain & Matching Engine Skills (LPL Wealth Matching)
| Skill ID | Name | Core AWS Services | Python Tech Stack | Primary Function |
| :--- | :--- | :--- | :--- | :--- |
| **SKILL-01** | `behavioral_intake_crs` | API Gateway, DynamoDB, Bedrock | `boto3`, `pydantic` | Anonymous 10–12 question intake & slot-filling |
| **SKILL-02** | `agentic_rag_kg_retrieval` | OpenSearch Serverless, AWS Neptune, Bedrock | `boto3`, `opensearch-py` | Hybrid vector & property graph retrieval with S-IDs |
| **SKILL-03** | `mcdm_ahp_scoring_engine` | Lambda, Step Functions, Bedrock | `numpy`, `scipy` | Analytic Hierarchy Process (AHP) & matrix solver |
| **SKILL-04** | `explainable_match_generator` | Bedrock, S3, CloudFront | `jinja2`, `boto3` | Match Notes generator & fee disclosure engine |
| **SKILL-05** | `crm_sync_scheduling_agent` | EventBridge, Secrets Manager | `httpx`, `backoff` | Lead conversion, PII capture, CRM OAuth2 sync |
| **SKILL-06** | `portfolio_opt_harmonizer` | AWS Batch, ECS Fargate, Bedrock | `cvxpy`, `PyPortfolioOpt` | Black-Litterman Mean-Variance Optimization |

---

### AWS Workflow & Agentic AI Infrastructure Skills
| Skill ID | Name | Core AWS Services | Python Tech Stack | Primary Function |
| :--- | :--- | :--- | :--- | :--- |
| **SKILL-07** | `aws_agentic_ai_toolset_setup` | Bedrock Agents, Action Groups, AOSS, Guardrails | `boto3`, `pydantic` | Provisioning and running Bedrock Agentic Toolset |
| **SKILL-08** | `aws_cdk_foundation_bootstrap` | AWS CDK v2, VPC, KMS, IAM | `aws-cdk-lib` | Multi-env bootstrap, zero-trust network & IAM |
| **SKILL-09** | `aws_serverless_microservice_deploy` | API Gateway HTTP, Lambda, DynamoDB | `fastapi`, `powertools` | Serverless API microservices with Powertools |
| **SKILL-10** | `aws_event_driven_pipeline_orchestration` | EventBridge, SQS, Step Functions | `boto3`, `aws-cdk-lib` | Async message bus & state machine orchestration |
| **SKILL-11** | `aws_containerized_batch_compute` | AWS Batch, ECS Fargate, ECR, S3 | `cvxpy`, `docker`, `scipy` | High-performance batch quantitative compute |
| **SKILL-12** | `aws_observability_guardrails_ops` | CloudWatch Logs/Metrics, X-Ray, Budgets | `aws-cdk-lib`, `boto3` | EMF metric logging, X-Ray tracing & cost budgets |

---

## Detailed Specifications
Refer to the individual `.md` files generated for each skill for full source code, Pydantic schemas, and execution blueprints.
