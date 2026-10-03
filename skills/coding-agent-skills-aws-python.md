# AWS & Python Coding Agent Skills: LPL Financial Wealth Matching Architecture

This document defines a production-ready, modular suite of **Coding Agent Skills** designed for AI code-generation agents (e.g., Claude Engineer, Codex, Amazon Q, Custom Agents). These skills enable automated generation of an enterprise-grade, agentic wealth-management matching engine based on the **LPL Financial UX & Fintech LLM Matching Architecture**.

---

## Technical Stack Standard

- **Cloud Provider:** AWS (Serverless & Cloud-Native)
- **Primary Language:** Python 3.12+
- **Core AWS Services:** Amazon Bedrock, OpenSearch Serverless, DynamoDB, AWS Lambda, Step Functions, EventBridge, API Gateway, AWS Neptune, ECS Fargate, AWS KMS, CloudWatch
- **Core Python Frameworks:** `boto3`, `pydantic` (v2), `fastapi`, `langgraph` / `langchain-core`, `numpy`, `scipy`, `cvxpy`, `pyportfolioopt`, `httpx`

---

## Summary of Agent Skill Matrix

| Skill ID | Skill Name | AWS Tech Stack | Python Core Libraries | Core Architectural Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **SKILL-01** | `behavioral_intake_crs` | API Gateway, Bedrock, DynamoDB | `fastapi`, `pydantic`, `langgraph` | Low-friction 10-12 Q intake, anonymous state tracking & dynamic slot-filling |
| **SKILL-02** | `agentic_rag_kg_retrieval` | OpenSearch Serverless, Neptune, Bedrock | `boto3`, `opensearch-py`, `gremlinpython` | Hybrid vector + Knowledge Graph retrieval with zero out-of-inventory tool calling |
| **SKILL-03** | `mcdm_ahp_scoring_engine` | Lambda, Step Functions, Bedrock | `numpy`, `scipy`, `pydantic` | Saaty 1-9 AHP pairwise matrix, $CI/CR$ consistency check, multi-agent debate |
| **SKILL-04** | `explainable_match_generator` | Bedrock, S3, CloudFront | `jinja2`, `pydantic`, `boto3` | Human-readable Match Notes, transparent fee breakdown, fiduciary disclosures |
| **SKILL-05** | `crm_sync_scheduling_agent` | EventBridge, Lambda, Secrets Manager | `httpx`, `backoff`, `pydantic` | PII capture at booking, OAuth2 CRM sync (ClientWorks/Redtail), event emission |
| **SKILL-06** | `portfolio_opt_harmonizer` | AWS Batch / ECS Fargate, Bedrock | `cvxpy`, `pyportfolioopt`, `numpy` | LLM signal extraction + Black-Litterman MVO ($\max_w w^T r - \lambda w^T \Sigma w$) |

---
---

# SKILL-01: Behavioral Intake & Perception Agent (`behavioral_intake_crs`)

### Role & Purpose
Act as an expert backend/AI engineer generating a Python-based Conversational Recommender System (CRS) microservice on AWS. It implements Stage 1 of the wealth matching pipeline: a low-friction, progressive 10-12 question intake assessment that captures investor decision-making styles, emotional money orientations, advisor role expectations, and life-stage events without requiring upfront PII.

### AWS & Python Architecture
- **Infrastructure:** AWS API Gateway → AWS Lambda / Fargate → DynamoDB (Anonymous Session State).
- **LLM Orchestration:** Amazon Bedrock (Anthropic Claude 3.5 Sonnet / Haiku via `boto3`).
- **State Management:** DynamoDB Single-Table Design (`TTL` enabled for 24h session expiration).

### Input & Output Schema

```json
// Input Payload (Post Turn)
{
  "session_id": "anon_sess_982347101",
  "turn_number": 3,
  "selected_option_id": "opt_collaborative_delegator",
  "free_text_input": "I prefer quarterly reviews and cautious growth."
}

// Output Payload
{
  "session_id": "anon_sess_982347101",
  "next_question": {
    "question_id": "q_04_life_stage",
    "dimension": "life_stage_transition",
    "text": "Which major transition best reflects your primary focus over the next 3-5 years?",
    "options": [
      {"id": "opt_business_exit", "label": "Preparing for a business exit or liquidity event"},
      {"id": "opt_retirement_decumulation", "label": "Transitioning into retirement decumulation"},
      {"id": "opt_estate_legacy", "label": "Structuring family wealth and generational transfer"}
    ]
  },
  "is_complete": false,
  "progress_percentage": 33.3
}
```

### Python Implementation Guidelines & Code Patterns

```python
import json
import os
import boto3
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

# Pydantic State Schema
class PreferenceState(BaseModel):
    session_id: str
    decision_style: Optional[str] = None  # e.g., Analytical vs Collaborative
    emotional_money_orientation: Optional[str] = None  # e.g., Preservation vs Growth
    advisor_role_expectation: Optional[str] = None  # e.g., Portfolio Mgr vs Life Planner
    life_stage_transition: Optional[str] = None
    communication_cadence: Optional[str] = None
    accumulated_hints: Dict[str, float] = Field(default_factory=dict)

class DynamicSlotFiller:
    def __init__(self, table_name: str):
        self.dynamodb = boto3.resource('dynamodb')
        self.table = self.dynamodb.Table(table_name)
        self.bedrock = boto3.client('bedrock-runtime', region_name=os.getenv('AWS_REGION', 'us-east-1'))

    def update_session_state(self, session_id: str, dimension: str, value: str) -> PreferenceState:
        response = self.table.get_item(Key={'session_id': session_id})
        item = response.get('Item', {'session_id': session_id, 'accumulated_hints': {}})
        state = PreferenceState(**item)
        setattr(state, dimension, value)
        state.accumulated_hints[f"{dimension}:{value}"] = 1.0
        
        self.table.put_item(Item=state.model_dump())
        return state
```

### Safety & Compliance Guardrails
1. **Zero Upfront PII:** Reject any input containing email, phone number, SSN, or exact street address during intake turns. Return a sanitized input flag if detected.
2. **Session Privacy:** Ensure DynamoDB tables use AWS KMS Customer Managed Keys (CMK) and auto-expire items via TTL after 24 hours.

---
---

# SKILL-02: Agentic RAG & Knowledge Graph Retrieval Agent (`agentic_rag_kg_retrieval`)

### Role & Purpose
Act as a senior data systems engineer building an Agentic RAG and Knowledge Graph retrieval engine. The agent retrieves candidate wealth advisors from OpenSearch Serverless (for semantic/vector filtering) and AWS Neptune (for advisor ego-networks and specialty graph nodes). It strictly uses **Tool-Calling with Semantic IDs (S-IDs)** to eliminate out-of-inventory hallucinations.

### AWS & Python Architecture
- **Vector Search:** Amazon OpenSearch Serverless (k-NN index with Titan Multimodal / Cohere Embeddings).
- **Knowledge Graph:** AWS Neptune (Property Graph accessed via Gremlin-Python / SPARQL).
- **Routing & Tool Calling:** Bedrock Tool-Calling API (`boto3`).

### Tool-Calling & Inventory Constraint Pattern

```python
import boto3
import json

class CandidateRetrievalEngine:
    def __init__(self, opensearch_endpoint: str, neptune_endpoint: str):
        self.bedrock = boto3.client('bedrock-runtime')
        self.opensearch_endpoint = opensearch_endpoint

    def get_tool_spec(self):
        return {
            "toolSpec": {
                "name": "query_advisor_inventory",
                "description": "Retrieves verified advisor Semantic IDs (S-IDs) based on structured behavioral filters.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": {
                            "decision_style": {"type": "string"},
                            "specialty_nodes": {"type": "array", "items": {"type": "string"}},
                            "min_tenure_years": {"type": "integer"}
                        },
                        "required": ["decision_style"]
                    }
                }
            }
        }

    def execute_hybrid_retrieval(self, state_dict: dict) -> list:
        # Step 1: Query OpenSearch for vector similarity
        # Step 2: Traverse Neptune Graph for ego-network attribute match
        # Step 3: Return list of deterministic S-IDs (e.g., ["ADV-8832", "ADV-1049"])
        s_ids = ["ADV-8832", "ADV-1049", "ADV-4491"]
        return s_ids
```

### Safety & Compliance Guardrails
1. **Zero Out-of-Inventory Risk:** LLM is strictly restricted from fabricating advisor names or credentials. Recommendations MUST map directly to retrieved `S-IDs` returned by deterministic API tool calls.
2. **Ego-Network Privacy:** Graph nodes represent aggregated practice capabilities; individual client identities are masked in graph traversals.

---
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

---
---

# SKILL-04: Explainable Match & Profile Generator (`explainable_match_generator`)

### Role & Purpose
Act as a frontend integration & UX engineer creating transparent, human-readable **Match Notes** and profile outputs. The generated code synthesizes AHP score outputs and client preference vectors into plain-English explainability briefs, highlighting fee model transparency (Fee-Only vs Fee-Based, SAM vs MWP) and fiduciary credentials.

### AWS & Python Architecture
- **Processing:** AWS Lambda with `jinja2` templating engine.
- **LLM Refinement:** Amazon Bedrock (In-Context grounded prompt payload).
- **Static Asset CDN:** Amazon S3 + CloudFront (for advisor headshots, firm disclosures, ADV Part 2 links).

### Jinja2 Match Note & Disclosure Template Pattern

```python
from jinja2 import Template

MATCH_NOTE_TEMPLATE = '''
### Compatibility Analysis: {{ advisor_name }} (Match Score: {{ match_score }}%)

**Primary Alignment Rationale:**
- **Decision Alignment:** {{ match_notes.decision_alignment }}
- **Life-Stage Specialization:** {{ match_notes.life_stage_notes }}
- **Communication Fit:** {{ match_notes.communication_notes }}

**Fee & Fiduciary Structure:**
- **Advisory Model:** {{ fee_structure.model_type }} ({{ fee_structure.custody_chassis }})
- **Platform Fee Model:** {{ fee_structure.fee_description }}
- **Fiduciary Registration:** Registered Investment Advisor / Independent Contractor
'''

def render_match_profile(advisor_data: dict, match_score: float, match_notes: dict) -> str:
    template = Template(MATCH_NOTE_TEMPLATE)
    return template.render(
        advisor_name=advisor_data['name'],
        match_score=round(match_score * 100, 1),
        match_notes=match_notes,
        fee_structure=advisor_data['fee_structure']
    )
```

### Safety & Compliance Guardrails
1. **No Proprietary Sales Steering:** Match notes MUST explicitly state the qualitative drivers of the score to eliminate user perception of 'pay-to-play' lead routing.
2. **Fee Transparency:** Must explicitly outline whether the recommendation uses SAM (advisor-traded) or MWP (automated TAMP) platform chassis and disclose platform overlay fee structures.

---
---

# SKILL-05: CRM Synchronization & Scheduling Agent (`crm_sync_scheduling_agent`)

### Role & Purpose
Act as an enterprise integration engineer generating an event-driven webhook and CRM integration module. This skill manages Stage 4 execution: capturing PII **only when the client schedules a meeting**, emitting AWS EventBridge events, and syncing the structured behavioral profile directly into advisor CRMs (ClientWorks, Redtail, Wealthbox).

### AWS & Python Architecture
- **Event Bus:** AWS EventBridge (Custom Bus: `com.wealth.matching.events`).
- **Secrets Management:** AWS Secrets Manager (OAuth2 tokens for ClientWorks/Redtail APIs).
- **HTTP Client:** Python `httpx` with `backoff` retry logic.

### Python EventBridge & Webhook Integration Pattern

```python
import json
import boto3
import httpx
import backoff

events_client = boto3.client('events')

class CRMSyncAgent:
    def __init__(self, secrets_namespace: str):
        self.secrets_client = boto3.client('secretsmanager')
        self.secrets_namespace = secrets_namespace

    def publish_booking_event(self, booking_payload: dict):
        return events_client.put_events(
            Entries=[{
                'Source': 'wealth.matching.engine',
                'DetailType': 'ClientConsultationBooked',
                'Detail': json.dumps(booking_payload),
                'EventBusName': 'com.wealth.matching.events'
            }]
        )

    @backoff.on_exception(backoff.expo, httpx.HTTPError, max_tries=4)
    async def sync_to_clientworks_api(self, api_url: str, auth_token: str, behavioral_brief: dict):
        headers = {'Authorization': f'Bearer {auth_token}', 'Content-Type': 'application/json'}
        async with httpx.AsyncClient() as client:
            res = await client.post(api_url, json=behavioral_brief, headers=headers)
            res.raise_for_status()
            return res.json()
```

### Safety & Compliance Guardrails
1. **PII Isolation:** PII is captured strictly during calendar booking; unbooked anonymous profiles never store names or contact numbers.
2. **Mutual TLS & OAuth2:** All external API requests to ClientWorks or Redtail must authenticate via AWS Secrets Manager OAuth2 credentials using TLS 1.3.

---
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