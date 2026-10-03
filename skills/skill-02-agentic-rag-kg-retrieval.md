# Coding Agent Skill Specification: SKILL-02

> **Target Platform:** AWS (Serverless / Managed AI)
> **Runtime Language:** Python 3.11+
> **Architecture Source:** LPL Financial Wealth Matching Analysis & Fintech LLM Engine Research

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
