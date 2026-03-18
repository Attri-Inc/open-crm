import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  archiveEntity,
  createEntity,
  createRelationship,
  deleteRelationship,
  getEntity,
  listEntityFieldProvenance,
  listEvents,
  searchEntities,
  traverseGraph,
  updateEntity,
} from "./db.js";

const server = new Server(
  {
    name: "opencrm",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools = [
  {
    name: "create_entity",
    description: "Create a CRM entity.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        type: { type: "string" },
        properties: { type: "object" },
        summary: { type: "string" },
        confidence: { type: "number" },
        verification: { type: "string" },
        provenance: { type: "object" },
        status: { type: "string" },
        schema_version: { type: "string" },
        field_provenance: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_path: { type: "string" },
              provenance: { type: "object" },
            },
          },
        },
      },
      required: ["type"],
    },
  },
  {
    name: "update_entity",
    description: "Update a CRM entity by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        properties: { type: "object" },
        replace_properties: { type: "boolean" },
        summary: { type: "string" },
        confidence: { type: "number" },
        verification: { type: "string" },
        provenance: { type: "object" },
        status: { type: "string" },
        field_provenance: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_path: { type: "string" },
              provenance: { type: "object" },
            },
          },
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_entity",
    description: "Fetch a CRM entity by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        include_field_provenance: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "search_entities",
    description: "Search entities via structured filters and optional FTS query.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        q: { type: "string" },
        filters: { type: "array", items: { type: "object" } },
        limit: { type: "number" },
        offset: { type: "number" },
        sort: { type: "string" },
        order: { type: "string", enum: ["asc", "desc"] },
      },
    },
  },
  {
    name: "link_entities",
    description: "Create a relationship between two entities.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        from_id: { type: "string" },
        to_id: { type: "string" },
        type: { type: "string" },
        metadata: { type: "object" },
        confidence: { type: "number" },
        verification: { type: "string" },
      },
      required: ["from_id", "to_id", "type"],
    },
  },
  {
    name: "unlink_entities",
    description: "Delete a relationship by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "traverse_graph",
    description: "Traverse entity relationships.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        direction: { type: "string", enum: ["out", "in", "both"] },
        type: { type: "string" },
        depth: { type: "number" },
        limit: { type: "number" },
      },
      required: ["entity_id"],
    },
  },
  {
    name: "get_entity_history",
    description: "Get event ledger entries for an entity.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
      },
      required: ["entity_id"],
    },
  },
  {
    name: "archive_entity",
    description: "Soft-delete (archive) an entity.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_entity": {
        const entity = createEntity(args as any);
        return jsonResult({ entity });
      }
      case "update_entity": {
        const { id, ...patch } = args as any;
        const entity = updateEntity(id, patch);
        if (!entity) return jsonResult({ error: "Not found" }, true);
        return jsonResult({ entity });
      }
      case "get_entity": {
        const { id, include_field_provenance } = args as any;
        const entity = getEntity(id);
        if (!entity) return jsonResult({ error: "Not found" }, true);
        const field_provenance = include_field_provenance
          ? listEntityFieldProvenance(id)
          : undefined;
        return jsonResult({ entity, field_provenance });
      }
      case "search_entities": {
        const results = searchEntities(args as any);
        return jsonResult({ results });
      }
      case "link_entities": {
        const relationship = createRelationship(args as any);
        return jsonResult({ relationship });
      }
      case "unlink_entities": {
        const { id } = args as any;
        const ok = deleteRelationship(id);
        if (!ok) return jsonResult({ error: "Not found" }, true);
        return jsonResult({ deleted: true });
      }
      case "traverse_graph": {
        const graph = traverseGraph(args as any);
        return jsonResult(graph);
      }
      case "get_entity_history": {
        const { entity_id, limit, offset } = args as any;
        const events = listEvents(entity_id, limit ?? 50, offset ?? 0);
        return jsonResult({ events });
      }
      case "archive_entity": {
        const { id } = args as any;
        const entity = archiveEntity(id);
        if (!entity) return jsonResult({ error: "Not found" }, true);
        return jsonResult({ entity });
      }
      default:
        return jsonResult({ error: `Unknown tool: ${name}` }, true);
    }
  } catch (err: any) {
    return jsonResult({ error: err?.message ?? "Tool error" }, true);
  }
});

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

const transport = new StdioServerTransport();
server.connect(transport);

