# SKILL-07: AWS Agentic AI Toolset Setup & Orchestration (`aws_agentic_ai_toolset_setup`)

## Objective
Provide coding agents with a complete specification to provision, configure, deploy, and execute the **AWS Agentic AI Toolset**. This encompasses Amazon Bedrock Agents, Bedrock Agent Core Runtime, Action Groups (Tool Calling with OpenAPI 3.0), Bedrock Knowledge Bases (OpenSearch Serverless Vector Search), Bedrock Guardrails, and Boto3 Python invocation workflows.

---

## AWS Architecture & Sub-System Map
```
  [ Client Application / Chat Interface ]
                     │
                     ▼
  [ Amazon Bedrock Agent Runtime (boto3) ]
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
  [ Bedrock     [ Action     [ Knowledge Base ]
  Guardrails ]  Groups ]     (OpenSearch Serverless)
     (PII/      (Lambda +        │
    Rules)       OpenAPI)        ▼
                    │       [ S3 Raw Embeddings ]
                    ▼
          [ Downstream AWS Services ]
          (DynamoDB / CRM / Analytics)
```

---

## Technical Stack
- **AI Orchestration:** Amazon Bedrock Agents (`anthropic.claude-3-5-sonnet-20241022-v2:0` or `amazon.nova-pro-v1:0`)
- **Knowledge Base:** Amazon Bedrock Knowledge Bases with OpenSearch Serverless (AOSS) Vector Index
- **Action Groups:** OpenAPI 3.0 / JSON Schema + AWS Lambda target execution
- **Safety & Compliance:** Amazon Bedrock Guardrails (Denied Topics, Word Filters, Sensitive Data/PII Masking, Contextual Grounding Check)
- **Infrastructure:** AWS CDK v2 (Python)
- **Runtime SDK:** Python 3.12, `boto3`, `pydantic>=2.0`

---

## Data Schemas (Pydantic v2)

```python
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ToolParameterSpec(BaseModel):
    name: str = Field(..., description="Parameter identifier")
    type: str = Field(..., description="Data type: string, integer, boolean, object")
    description: str = Field(..., description="Purpose and usage instructions for LLM")
    required: bool = Field(default=True)

class ActionGroupToolSpec(BaseModel):
    name: str = Field(..., description="Tool name, e.g., 'search_advisors'")
    description: str = Field(..., description="Detailed description guiding when the LLM should invoke this tool")
    parameters: List[ToolParameterSpec]
    lambda_arn: str = Field(..., description="Target Lambda ARN for handling tool invocation")

class BedrockGuardrailConfig(BaseModel):
    name: str = Field(default="WealthManagementGuardrail")
    blocked_input_messaging: str = Field(default="Request violates compliance or safety guidelines.")
    blocked_outputs_messaging: str = Field(default="Generated response flagged by compliance guardrails.")
    denied_topics: List[str] = Field(default=[
        "Unguaranteed Investment Returns",
        "Crypto Speculation Advice",
        "Tax Evasion Strategies"
    ])
    pii_redaction_types: List[str] = Field(default=["SSN", "BANK_ACCOUNT_NUMBER", "CREDIT_CARD"])

class AgentInvocationRequest(BaseModel):
    agent_id: str
    agent_alias_id: str
    session_id: str
    input_text: str
    session_state: Optional[Dict[str, Any]] = None

class AgentInvocationResponse(BaseModel):
    session_id: str
    output_text: str
    citations: List[Dict[str, Any]] = []
    trace_steps: List[Dict[str, Any]] = []
```

---

## AWS CDK Provisioning Construct (Python)

```python
from aws_cdk import (
    Stack,
    aws_bedrock as bedrock,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_opensearchserverless as aoss,
    aws_s3 as s3,
)
from constructs import Construct

class BedrockAgenticToolsetConstruct(Construct):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id)

        # 1. IAM Role for Bedrock Agent
        agent_role = iam.Role(
            self, "BedrockAgentRole",
            assumed_by=iam.ServicePrincipal("bedrock.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonBedrockFullAccess")
            ]
        )

        # 2. Bedrock Guardrail Provisioning
        guardrail = bedrock.CfnGuardrail(
            self, "AgentGuardrail",
            name="wealth-matching-guardrail",
            blocked_input_messaging="Your request contains prohibited topics or sensitive PII.",
            blocked_outputs_messaging="Response blocked due to compliance policies.",
            topic_policy_config=bedrock.CfnGuardrail.TopicPolicyConfigProperty(
                topics_config=[
                    bedrock.CfnGuardrail.TopicConfigProperty(
                        name="GuaranteedReturns",
                        definition="Claims that investment returns are guaranteed or risk-free.",
                        type="DENY"
                    )
                ]
            ),
            sensitive_information_policy_config=bedrock.CfnGuardrail.SensitiveInformationPolicyConfigProperty(
                pii_entities_config=[
                    bedrock.CfnGuardrail.PiiEntityConfigProperty(type="US_SOCIAL_SECURITY_NUMBER", action="BLOCK"),
                    bedrock.CfnGuardrail.PiiEntityConfigProperty(type="CREDIT_DEBIT_CARD_NUMBER", action="BLOCK")
                ]
            )
        )

        guardrail_version = bedrock.CfnGuardrailVersion(
            self, "GuardrailVersion",
            guardrail_identifier=guardrail.attr_guardrail_id,
            description="v1.0"
        )

        # 3. Bedrock Agent Definition
        self.agent = bedrock.CfnAgent(
            self, "WealthMatchingAgent",
            agent_name="lpl-wealth-matching-agent",
            agent_resource_role_arn=agent_role.role_arn,
            foundation_model="anthropic.claude-3-5-sonnet-20241022-v2:0",
            instruction=(
                "You are an AI Advisor Matching Copilot for wealth management. "
                "Your objective is to guide clients through behavioral intake, retrieve advisors "
                "using registered tools, calculate match fit, and output transparent summaries. "
                "Always adhere to strict compliance guidelines and never guarantee returns."
            ),
            guardrail_configuration=bedrock.CfnAgent.GuardrailConfigurationProperty(
                guardrail_identifier=guardrail.attr_guardrail_id,
                guardrail_version=guardrail_version.attr_version
            ),
            idle_session_ttl_in_seconds=1800
        )
```

---

## Python Runtime Agent Execution Engine (`agent_runtime.py`)

```python
import boto3
import json
from typing import Dict, Any, Generator

class BedrockAgentClient:
    def __init__(self, region_name: str = "us-east-1"):
        self.client = boto3.client("bedrock-agent-runtime", region_name=region_name)

    def invoke_agent(
        self,
        agent_id: str,
        agent_alias_id: str,
        session_id: str,
        prompt: str,
        enable_trace: bool = True
    ) -> Dict[str, Any]:
        response = self.client.invoke_agent(
            agentId=agent_id,
            agentAliasId=agent_alias_id,
            sessionId=session_id,
            inputText=prompt,
            enableTrace=enable_trace,
            endSession=False
        )

        completion = ""
        traces = []
        citations = []

        for event in response.get("completion", []):
            if "chunk" in event:
                chunk = event["chunk"]
                completion += chunk["bytes"].decode("utf-8")
                if "attribution" in chunk:
                    citations.append(chunk["attribution"])
            elif "trace" in event:
                traces.append(event["trace"])

        return {
            "session_id": session_id,
            "completion": completion,
            "citations": citations,
            "trace_steps": traces
        }

if __name__ == "__main__":
    agent_client = BedrockAgentClient()
    res = agent_client.invoke_agent(
        agent_id="AGENT12345",
        agent_alias_id="TSTALIASID",
        session_id="session-user-987",
        prompt="I am looking for an advisor who specializes in ESG portfolios and retirement planning."
    )
    print("Agent Response:", res["completion"])
```

---

## Compliance & Operational Rules for Coding Agents
1. **Zero Hardcoded Keys:** Always resolve AWS credentials via ambient IAM Role / IAM Identity Center.
2. **Session Persistence:** State must be passed via `sessionId` or external DynamoDB cache; agents must operate statelessly at the compute tier.
3. **Traceability:** Enable trace logging (`enableTrace=True`) during non-prod runs to debug tool-calling execution graphs.
4. **Guardrail Violation Handling:** Intercept `BedrockAgentRuntime` exceptions when input or output triggers guardrail blocking rules.
