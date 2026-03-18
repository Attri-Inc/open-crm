# OpenCRM Vision + High-Level Architecture

## Vision
OpenCRM is a local-first, headless CRM designed for AI agents as the primary users.

OpenCRM is not a "chatbot CRM". It is a system-of-record and retrieval substrate that lets agents:
1. Store canonical CRM objects (contacts, companies, deals, interactions, tasks).
2. Preserve evidence and provenance for every important claim.
3. Retrieve facts deterministically (filters, FTS, graph traversal) and optionally semantically (future vectors).
4. Maintain compact, regeneratable briefings (contact/account/deal) that stay tied to evidence.

## Design Principles
1. Agents are the UI.
2. Deterministic by default. Semantic is additive, never the only retrieval path.
3. Evidence-first. Claims should be traceable to raw artifacts.
4. Corrections are normal. The system must support superseding and retracting claims without losing history.
5. Summaries are derived, not authoritative.
6. Local-only v0. No required cloud dependencies.
7. Vendor-neutral. OpenCRM should not require a specific LLM provider.

## Who This Is For
1. Agent builders who need a reliable CRM substrate for many autonomous workflows.
2. Teams that want local control of CRM data while giving agents safe, typed access.

## Non-Goals (Initial OSS Release)
1. Hosted sync or multi-tenant SaaS.
2. Email/calendar ingestion and enrichment connectors (provide extension points instead).
3. End-user UI.
4. "Vector-only" memory or opaque summaries that cannot be audited.

---

## Bare Minimum To Drive Value (OSS Release v0.1)

### Must-Have Capabilities
1. Local runtime with SQLite.
2. REST API for automation.
3. MCP server for agent tool access (Claude and other MCP clients).
4. Canonical entities and relationships.
5. Deterministic retrieval: structured filters, FTS, and relationship traversal.
6. Event ledger for every mutation.
7. Provenance metadata so agents can answer "why do we believe this?".
8. Import/export.

### Minimum "Memory" That Actually Matters For CRM
To deliver real CRM value, OpenCRM needs more than generic notes.

1. Artifacts (raw evidence).
2. Observations (typed claims extracted from artifacts).
3. Briefs (derived summaries that cite observations).
4. Conflicts (explicit records when observations disagree) that create verification tasks.

OpenCRM should support these primitives even if the extraction is performed by an external agent.

---

## High-Level Architecture

```mermaid
flowchart LR
  A[Agent Client (Claude / other)] -->|MCP tools| M[MCP Server]
  A -->|REST| R[REST API Server]

  M --> S[OpenCRM Core Service]
  R --> S

  S --> DB[(SQLite)]
  DB --> E[Entities]
  DB --> L[Relationships]
  DB --> EV[Event Ledger]
  DB --> FTS[FTS Index]
  DB --> AR[Artifacts]
  DB --> OB[Observations]
  DB --> BR[Briefs]
  DB --> CF[Conflicts]

  subgraph "Optional (Future)"
    V[(Vector Index)]
  end

  S -.-> V
```

### Runtime Model (Local)
1. REST server runs on localhost for programmatic access.
2. MCP server runs over stdio for Claude Desktop and other MCP clients.
3. Both call the same OpenCRM core (database + policies).

---

## Core Data Model (Conceptual)

### Entities (System of Record)
1. `Contact`, `Company`, `Deal`, `Interaction`, `Task`, `Agent`.
2. Stored as typed entities with JSON properties.
3. Relationships are first-class edges.

### Event Ledger (Audit)
1. Every create/update/archive produces an immutable event.
2. Events record actor context (agent id, tool call id, prompt hash).

### Provenance (Trust)
1. Entity-level provenance (default source context).
2. Field-level provenance overrides for specific fields.

---

## CRM-Specific Memory Redesign (Beyond Generic "Memory")

### 1) Artifacts
Raw, immutable sources of truth.

Examples:
1. Email thread.
2. Call transcript.
3. Meeting notes.
4. Document attachment.

Properties:
1. `artifact_id`, `artifact_type`, `timestamp`, `participants`, `hash`.
2. `content` or pointer to content.

### 2) Observations
Atomic, typed claims extracted from artifacts.

Examples:
1. Deal budget is 120000 USD.
2. Decision maker is Maya Chen.
3. Security review required.
4. Next step is "send pricing".

Key requirements:
1. Evidence link: each observation references `artifact_id` plus a stable snippet pointer.
2. Lifecycle: `current`, `superseded`, `retracted`.
3. Time: `as_of` and optional `valid_until`.
4. Confidence and verification.

### 3) Briefs
Derived summaries that are always regeneratable from observations.

Rules:
1. Brief lines should cite observation ids.
2. Briefs are not authoritative.
3. Briefs must be re-buildable to prevent drift.

### 4) Conflicts
Explicit records when two observations cannot both be true.

Rules:
1. Never silently choose a winner.
2. Create a conflict and a verification task.

---

## User Control (Policy) For Observations and Briefs
Yes, there should be user control, but it should be structured and versioned.

### Memory Policy (Per Workspace, Optional Per Entity Type)
A policy defines:
1. Which facets to extract.
2. What requires evidence.
3. Confidence thresholds for marking observations as `current`.
4. Conflict behavior.
5. Brief template sections and constraints.
6. Rebuild cadence rules.

Important: OpenCRM stores policy versions and tags every derived output with the policy version used.

---

## Retrieval Strategy (At Scale)
1. Structured filters for exact constraints.
2. FTS for fast keyword search across key text fields.
3. Graph traversal for relationship-heavy queries.
4. Optional vector search for semantic discovery (future module).
5. Progressive retrieval pattern: brief -> observations -> artifacts.

---

## Minimal MCP Tool Surface (v0.1)
OpenCRM should expose simple, composable tools that map to the primitives.

1. Entity tools: create/get/update/archive/search.
2. Relationship tools: link/unlink/traverse.
3. History tools: event ledger query.
4. Memory tools: ingest_artifact, add_observation, list_observations, get_brief, get_evidence.

---

## What We Should Build Next (Concrete Steps)
1. Add first-class tables and APIs for `artifacts`, `observations`, `briefs`, and `conflicts`.
2. Implement conflict detection and stale-fact checks that create `tasks`.
3. Implement policy storage and versioning.
4. Add MCP tools for the memory primitives.
5. Add import/export for all primitives.
6. Add a small "recipes" section in README with human prompts for Claude to ingest artifacts and generate briefs.

---

## Notes On Licensing
This repo currently uses a Sustainable Use style license (source-available). This is not OSI open source.

