---
name: saul-backend
description: Implement and maintain Saul Goodman's local backend daemon and API contracts. Use when tasks involve `saul-daemon/`, local HTTP endpoints, heartbeat or batch ingestion from VS Code, JSON persistence, pairing key validation, retention rules, CORS for local origins, duration aggregation, or Chrome compatibility with `/v1/tracking/vscode/summary`.
---

# Saul Backend

## Scope

- Keep the architecture local-first.
- Keep data in local JSON files unless explicitly asked otherwise.
- Keep privacy guarantees: never collect VS Code code content.

## Start Here

- Inspect `saul-daemon/index.cjs`.
- Inspect `docs/saul-daemon.md`.
- Inspect `docs/architecture.md`.
- Inspect `docs/vscode-extension.md`.
- Map current endpoint contracts before changing behavior.

## Non-Negotiables

- Preserve pairing key authentication for protected routes.
- Preserve Chrome compatibility for `/v1/tracking/vscode/summary`.
- Prefer backward-compatible endpoint evolution.
- Respect retention environment variables and deduplication guardrails.
- Restrict CORS to approved local origins (localhost, Chrome extension, VS Code webview).
- Avoid logging sensitive user data.

## Workflow

1. Read existing routes, payload contracts, and persistence helpers.
2. Define the minimal compatible contract change.
3. Implement auth, validation, sanitization, and persistence updates.
4. Add or update tests for parsing, auth, aggregation, and retention.
5. Update docs when endpoint or payload contracts change.
6. Report compatibility impact for Chrome background sync and VS Code integration.

## Change Playbooks

### Add Endpoint

- Define route and response shape.
- Validate pairing key before processing protected requests.
- Validate and sanitize payload input.
- Reuse existing JSON persistence helpers when possible.
- Keep error responses explicit and stable.
- Document request/response/auth contract.

### Change Tracking or Aggregation

- Verify deduplication behavior for heartbeat and batch events.
- Merge overlapping intervals to avoid double counting.
- Validate daily summary output consumed by Chrome extension.
- Validate retention cleanup does not remove active-day data unexpectedly.

### Change CORS or Integration

- Allow only expected local origins.
- Validate preflight and standard requests for Chrome and VS Code flows.
- Confirm daemon endpoints remain compatible with current background sync behavior.

## Validation Checklist

- Add deterministic tests for:
  - payload parsing and sanitization
  - pairing key auth success and failure
  - overlap merge and duration aggregation
  - retention cleanup
  - summary contract compatibility
- Run `npm test` for backend contract or aggregation changes.

## Output Expectations

When finishing backend changes, always include:

- endpoint contract details (request, response, auth)
- compatibility impact
- documentation updates
- tests added or changed and execution status
