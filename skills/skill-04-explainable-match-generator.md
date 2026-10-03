# Coding Agent Skill Specification: SKILL-04

> **Target Platform:** AWS (Serverless / Managed AI)
> **Runtime Language:** Python 3.11+
> **Architecture Source:** LPL Financial Wealth Matching Analysis & Fintech LLM Engine Research

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
