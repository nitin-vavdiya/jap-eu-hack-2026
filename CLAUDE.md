<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## Gotchas

### Gaia-X Compliance: x5c in JWT headers breaks OpenSSL 3.x

**Symptom:** Gaia-X compliance returns `"Invalid Certificate"` with `error:1E08010C:DECODER routines::unsupported`.

**Root cause:** The gx-compliance service calls `jose.importX509(pem, alg)` to verify the certificate. It reconstructs the PEM by wrapping the raw base64 value from the JWT `x5c` header array, but the resulting PEM lacks the `\n` line breaks that OpenSSL 3.x requires. This causes `importX509` to fail.

**Fix:** Do **not** put `x5c` in VC or VP JWT headers. Instead:
1. Expose a `/company/:id/cert.pem` endpoint that serves the PEM with proper line breaks.
2. Add `x5u: "https://<domain>/company/<id>/cert.pem"` to the RSA key's `publicKeyJwk` in the DID document.
3. Set `alg: "RS256"` on the RSA key in the DID document (not `PS256`).

**Reference:** RFC 7515 §4.1.6 requires `x5c` to be raw base64-encoded DER — no PEM headers, no line breaks — which is exactly what `jose.importX509` cannot parse when the compliance service reconstructs it.

---

### Gaia-X Compliance: correct JWT typ/cty and Content-Type

The gx-compliance controller uses `@ApiConsumes('application/vp+jwt')` and reads the raw body directly. Use:

| JWT | `typ` | `cty` | Request `Content-Type` |
|-----|-------|-------|------------------------|
| VC  | `vc+jwt` | `vc` | — |
| VP  | `vp+jwt` | `vp` | `application/vp+jwt` |

Do **not** use `vc+ld+json+jwt` / `vp+ld+json+jwt` — the development endpoint rejects them.

---

### Gaia-X Compliance: development endpoint is flaky

`https://compliance.lab.gaia-x.eu/development` occasionally returns `502 Bad Gateway`. This is a transient server-side failure, not a format rejection. Retry with a new registration attempt; the same VP format that got a 502 will often succeed on the next try.
