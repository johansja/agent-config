# Tool / vendor comparison procedure

## 1. Fan out
One subagent per candidate, dispatched together. Context for each = the identical checklist below, plus "English output, bullets, URL per claim, flag unverified". Goal names the *job* being evaluated (e.g. "central multi-cluster access control for existing clusters, not provisioning") and "current as of <today>".

## 2. Dimension checklist (adapt nouns, keep the axes)
1. **License & cost for the user's org specifically** — OSS licence vs binary licence; edition split (community/enterprise/prime); **size/revenue thresholds on "free" editions** (check them against the user's company — a large employer is often excluded); pricing unit (per node / per MAU / per resource) and whether it scales badly for their fleet (e.g. per-node on GPU fleets); public vs quote-only.
2. **Edition gating of the features the user needs** — verify per feature (SSO/OIDC/SAML, RBAC roles, audit logs, JIT) whether it's in the free tier; vendors commonly gate generic OIDC/SAML behind enterprise.
3. **Architecture & network** — components, agent direction (outbound reverse tunnel vs inbound), what happens when the central service is down.
4. **Identity model at the target** — impersonation of the real user vs per-user/shared service accounts (affects downstream audit attribution and blast radius; a shared cluster-admin SA is a red flag).
5. **Authz granularity** — scopes, custom roles, per-resource/verb, CRDs.
6. **Audit** — on by default?, per-request per-user attribution, session recording, SIEM export, gaps (bypass paths).
7. **Client access path** — credential type and default TTL (long-lived tokens vs short-lived certs), CLI, web UI depth.
8. **Operational weight** — footprint, HA backend, upgrade ordering/skew, supported-version window.
9. **Security track record** — advisory count/severity by year from the GitHub security advisories page; recurring classes.
10. **Project health** — use the GitHub API: latest release + date, commits on main in the last 12 months, which listed maintainers are actually active, unreviewed PRs, CNCF/LFX health status. **Stars are not health** — a repo with 1k+ stars can have zero commits for most of a year.

## 3. Synthesize
- Verdict line first.
- Table: rows = dimensions, columns = candidates, ✅/⚠️/❌ plus a few words. Bold the decisive cells (licence threshold, abandonment).
- Per-candidate: pros, cons, "when it's worth it" or "ruled out because".
- Recommendation as a numbered short list (stay / when to revisit / drop).
- Caveats: unpublished prices, items subagents flagged unverified, figures taken from lists without per-item checks.
