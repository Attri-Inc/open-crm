# OpenCRM

Open-source, self-hosted, agent-first CRM. Agents are the UI — OpenCRM is the system of record.

Local-only by design. No cloud dependencies. SQLite-backed with REST API and MCP server interfaces.

## Why OpenCRM

Traditional CRMs are built for humans clicking buttons. OpenCRM is built for AI agents that need:

- **Deterministic retrieval** — structured filters, full-text search, graph traversal
- **Evidence-first memory** — every claim traces back to raw artifacts
- **Correction as a first-class concept** — observations can be superseded or retracted without losing history
- **Provenance** — field-level source tracking for trust and auditability

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Server starts at `http://localhost:8787`.

### Seed with sample data

```bash
npm run seed
```

### Run with Docker

```bash
docker compose up --build
```

Data persists in a named volume (`crm-data`).

## MCP Server (Claude Desktop / Claude Code)

```bash
npm run mcp
```

Add to your MCP client config:

```json
{
  "mcpServers": {
    "opencrm": {
      "command": "/absolute/path/to/opencrm/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/opencrm/src/mcp.ts"],
      "env": {
        "CRM_DB_PATH": "/absolute/path/to/opencrm/data/crm.db"
      }
    }
  }
}
```

## Data Model

### Entities
Typed records: `contact`, `company`, `deal`, `interaction`, `task`, `agent`. JSON properties, status tracking, optional confidence and verification scores.

### Relationships
Directed edges between entities: `EMPLOYED_AT`, `ASSOCIATED_WITH`, `OWNS`, `INTERACTED_WITH`, `CREATED_BY`, `RELATED_TO`.

### Memory Layer

| Primitive | Purpose |
|-----------|---------|
| **Artifact** | Raw, immutable evidence (email, call transcript, meeting notes, document, note) |
| **Observation** | Typed claim extracted from an artifact. Lifecycle: `current` → `superseded` / `retracted` |
| **Brief** | Derived summary citing observations. Always regeneratable from evidence |
| **Conflict** | Explicit record when observations disagree. Requires resolution |

### Supporting

- **Event Ledger** — append-only audit trail for every mutation
- **Field Provenance** — per-field source tracking
- **FTS Index** — full-text search across entity properties

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/entities` | Create entity |
| `GET` | `/entities/:id` | Get entity (optional `?include_field_provenance=true`) |
| `PATCH` | `/entities/:id` | Update entity (merge or replace properties) |
| `DELETE` | `/entities/:id` | Archive entity |
| `POST` | `/relationships` | Create relationship |
| `GET` | `/relationships` | List relationships (`?entity_id=&type=`) |
| `DELETE` | `/relationships/:id` | Delete relationship |
| `GET` | `/search` | Search entities (`?type=&q=&filters=&sort=&order=&limit=&offset=`) |
| `GET` | `/graph` | Graph traversal (`?entity_id=&depth=&direction=&type=`) |
| `GET` | `/events` | Event history (`?entity_id=`) |
| `POST` | `/artifacts` | Ingest artifact |
| `GET` | `/artifacts/:id` | Get artifact |
| `GET` | `/artifacts` | List artifacts (`?artifact_type=`) |
| `POST` | `/observations` | Add observation |
| `GET` | `/observations/:id` | Get observation |
| `GET` | `/observations` | List observations (`?entity_id=&lifecycle=`) |
| `PATCH` | `/observations/:id/supersede` | Supersede observation |
| `PATCH` | `/observations/:id/retract` | Retract observation |
| `POST` | `/briefs` | Create brief |
| `GET` | `/briefs/:id` | Get brief |
| `GET` | `/briefs` | List briefs (`?entity_id=&brief_type=`) |
| `POST` | `/conflicts` | Create conflict |
| `GET` | `/conflicts/:id` | Get conflict |
| `GET` | `/conflicts` | List conflicts (`?entity_id=&status=`) |
| `PATCH` | `/conflicts/:id/resolve` | Resolve conflict |
| `GET` | `/export` | Export all data |
| `POST` | `/import` | Import data |

All list endpoints return paginated responses: `{ items, total, limit, offset, has_more }`.

Write endpoints support idempotency via `x-idempotency-key` header.

## MCP Tools (27)

**Entities:** `create_entity`, `update_entity`, `get_entity`, `search_entities`, `archive_entity`

**Relationships:** `link_entities`, `unlink_entities`, `list_relationships`, `traverse_graph`

**History:** `get_entity_history`

**Artifacts:** `ingest_artifact`, `get_artifact`, `list_artifacts`

**Observations:** `add_observation`, `get_observation`, `list_observations`, `supersede_observation`, `retract_observation`

**Briefs:** `create_brief`, `get_brief`, `list_briefs`

**Conflicts:** `create_conflict`, `get_conflict`, `list_conflicts`, `resolve_conflict`

**Data:** `export_data`, `import_data`

## Development

```bash
npm run dev          # Start REST API with hot reload
npm run mcp          # Start MCP server (stdio)
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run build        # TypeScript compile
npm run seed         # Populate with sample data
```

## Architecture

```
src/
  config.ts    — Environment config (PORT, CRM_DB_PATH)
  models.ts    — TypeScript interfaces
  schemas.ts   — Zod validation schemas
  db.ts        — SQLite data layer (all CRUD + FTS + graph)
  http.ts      — HTTP helpers (actor context, idempotency)
  server.ts    — Express REST API
  mcp.ts       — MCP stdio server
```

Both the REST API and MCP server share the same `db.ts` core.

## License

Apache 2.0
