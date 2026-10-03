# SKILL-21: LPL Advisor Channel & Platform Alignment Prompts (`lpl_channel_matching_prompts`)

## Purpose & Scope
Defines the reasoning prompts and evaluation logic for LLM agents mapping client financial profiles to LPL Financial's operational channels (Independent Advisory, Hybrid RIA, Institution Services) and portfolio execution programs (SAM, MWP, MAS, GWP).

---

## 1. LPL Channel & Platform Alignment Matrix

| Client Profile / Need | Optimal LPL Advisor Channel | Preferred LPL Program | Key Advisor Certification |
| :--- | :--- | :--- | :--- |
| **Pre-Retiree (50–65) / Income Focus** | Independent Wealth Advisor | Model Wealth Portfolios (MWP) | CFP® (Certified Financial Planner) [1] |
| **Business Exit / Liquidity Event** | Hybrid RIA / Enterprise Team | Strategic Asset Management (SAM) | CEPA (Certified Exit Planning Advisor) [4, 10] |
| **Ultra HNW ($5M+) / Family Office** | Private Wealth / Institutional | Manager Access Select (MAS) | CPWA® / CFA® [1, 16] |
| **Emerging Investor ($100k–$250k)** | Institution / Hybrid Advisor | Guided Wealth Portfolios (GWP) | CFP® / Series 65 [1, 14] |

---

## 2. LLM Decision Reasoning Prompt Template

```markdown
PROMPT TEMPLATE: LPL Advisor & Platform Matching Reasoning

INPUT CLIENT PROFILE:
- Investable Assets: {investable_assets}
- Primary Life Event: {life_event}
- Risk & Delegation Style: {delegation_style}
- Standard of Care Preference: {fiduciary_preference}
- Complex Needs: {complex_needs}

LLM EVALUATION STEPS:
1. CHANNEL FIT: Determine whether client is best served by an Independent Brokerage Practice, a Hybrid RIA, or an Enterprise Team based on asset size and complexity.
2. PROGRAM SELECTION:
   - If client is a "Delegator" desiring institutional models -> Recommend LPL Model Wealth Portfolios (MWP) or Manager Access Select (MAS).
   - If client is a "Validator" wanting rep-managed customization -> Recommend LPL Strategic Asset Management (SAM).
3. CERTIFICATION MATCHING: Map complex triggers (e.g., CEPA for business sale, CPWA for private wealth, CFP for general retirement).
4. GENERATE REASONING STATEMENT GROUNDED IN LPL BUSINESS FRAMEWORKS.
```

---

## 3. Example LLM Matching Output Format

```json
{
  "recommended_channel": "LPL Hybrid RIA / Private Wealth Team",
  "recommended_lpl_program": "Manager Access Select (MAS) & SAM Dual-Account",
  "primary_advisor_certifications": ["CEPA", "CPWA"],
  "matching_rationale": "Client has a $3.5M liquidity event from a business sale requiring immediate exit planning (CEPA) and estate structuring (CPWA). MWP centrally managed models provide core asset protection while SAM accommodates custom tax-overlay strategies.",
  "fee_structure_summary": "Fee-Based Advisory (1.10% total asset tier including 0.85% advisor fee and 0.25% LPL platform/custody overlay)."
}
```
