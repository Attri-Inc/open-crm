# Claude Connector Setup (MCP)

## 1) Install dependencies

```bash
npm install
```

## 2) Run the MCP server

```bash
npm run mcp
```

## 3) Add MCP config

Add this to your Claude Desktop MCP config, and adjust the absolute paths:

```json
{
  "mcpServers": {
    "opencrm": {
      "command": "/absolute/path/to/opencrm/node_modules/.bin/tsx",
      "args": [
        "/absolute/path/to/opencrm/src/mcp.ts"
      ],
      "env": {
        "CRM_DB_PATH": "/absolute/path/to/opencrm/data/crm.db"
      }
    }
  }
}
```

## 4) Verify tools

In Claude, you should see tools named `create_entity`, `search_entities`, and `traverse_graph`.
