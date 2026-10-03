# Architecture validation work queue

Use this folder to track work that brings the implementation into line with [`docs/technical-specification.md`](../docs/technical-specification.md).

## Assignment and status

| Ticket | Area | Owner | Status |
|---|---|---|---|
| ARCH-001 | Backend architecture and session/API flow | `/root/backend_alignment` | Implemented; live/formal validation open |
| ARCH-002 | Frontend contract, voice, glossary, and accessibility | `/root/frontend_alignment` | Implemented; integration/manual validation open |
| ARCH-003 | AWS infrastructure and security | `/root/infra_alignment` | Implemented in template; live validation open |

Agents should update their ticket with the files reviewed, concrete mismatches, changes made, and validation evidence. Mark a requirement **unvalidated** when the repo or available environment does not provide evidence for it; do not infer compliance from intended configuration alone.

The architecture baseline is the technical specification. The README and deployed stack may describe implementation choices that have drifted; record those differences and reconcile them with the specification.

The implementation tickets share one MVP REST contract so the three work areas remain compatible:

- `POST /session` returns `{sessionId, preferredLanguage}`.
- `POST /session/{id}/message` accepts `{message, preferredLanguage}` and returns `{text, glossaryTags, collectedPreferences, version, matches?}`.
- Session persistence and optimistic version checks belong in `AdvisorIntakeSessions`; advisor and glossary records belong in `AdvisorProfiles` and `GlossaryTerms`.

Live AWS deployment, IAM enforcement, compliance sign-off, accessibility certification, and production retention remain unvalidated until separately evidenced.
