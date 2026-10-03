# Coding Agent Skill Specification: SKILL-01

> **Target Platform:** AWS (Serverless / Managed AI)
> **Runtime Language:** Python 3.11+
> **Architecture Source:** LPL Financial Wealth Matching Analysis & Fintech LLM Engine Research

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
