# OpenCRM (Local-Only v0)

Agent-first CRM runtime with deterministic retrieval, field-level provenance, and a full event ledger. Local-only by design in v0.

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Configure env

```bash
cp .env.example .env
```

3. Run the REST API

```bash
npm run dev
```

The server defaults to `http://localhost:8787`.

## MCP Server (Claude Connector)

Run the MCP server:

```bash
npm run mcp
```

Example MCP config (Claude Desktop style):

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

Detailed steps: `docs/claude-connector.md`.

## REST Endpoints (v0)

- `POST /entities`
- `GET /entities/:id`
- `PATCH /entities/:id`
- `DELETE /entities/:id`
- `POST /relationships`
- `DELETE /relationships/:id`
- `GET /search`
- `GET /graph`
- `GET /events`

## MCP Tools (v0)

- `create_entity`
- `update_entity`
- `get_entity`
- `search_entities`
- `link_entities`
- `unlink_entities`
- `traverse_graph`
- `get_entity_history`

## Docs

- `VISION.md`
