import express from "express";
import cors from "cors";
import { config } from "./config.js";
import {
  archiveEntity,
  createEntity,
  createRelationship,
  deleteRelationship,
  getEntity,
  getIdempotentResponse,
  listEntityFieldProvenance,
  listEvents,
  searchEntities,
  storeIdempotentResponse,
  traverseGraph,
  updateEntity,
} from "./db.js";
import { getActorContext, parseIdempotency } from "./http.js";
import { SearchFilter } from "./models.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/entities", (req, res) => {
  const op = "POST /entities";
  const idempotencyKey = parseIdempotency(req);
  if (idempotencyKey) {
    const cached = getIdempotentResponse(op, idempotencyKey);
    if (cached) {
      return res.status(cached.status_code).json(cached.response);
    }
  }

  try {
    const entity = createEntity(req.body, getActorContext(req));
    const response = { entity };
    if (idempotencyKey) {
      storeIdempotentResponse(op, idempotencyKey, 201, response);
    }
    return res.status(201).json(response);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Invalid payload" });
  }
});

app.get("/entities/:id", (req, res) => {
  const entity = getEntity(req.params.id);
  if (!entity) return res.status(404).json({ error: "Not found" });

  const includeFieldProvenance = req.query.include_field_provenance === "true";
  const field_provenance = includeFieldProvenance
    ? listEntityFieldProvenance(entity.id)
    : undefined;

  return res.json({ entity, field_provenance });
});

app.patch("/entities/:id", (req, res) => {
  const op = "PATCH /entities/:id";
  const idempotencyKey = parseIdempotency(req);
  if (idempotencyKey) {
    const cached = getIdempotentResponse(op, idempotencyKey);
    if (cached) {
      return res.status(cached.status_code).json(cached.response);
    }
  }

  try {
    const updated = updateEntity(req.params.id, req.body, getActorContext(req));
    if (!updated) return res.status(404).json({ error: "Not found" });
    const response = { entity: updated };
    if (idempotencyKey) {
      storeIdempotentResponse(op, idempotencyKey, 200, response);
    }
    return res.json(response);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Invalid payload" });
  }
});

app.delete("/entities/:id", (req, res) => {
  const op = "DELETE /entities/:id";
  const idempotencyKey = parseIdempotency(req);
  if (idempotencyKey) {
    const cached = getIdempotentResponse(op, idempotencyKey);
    if (cached) {
      return res.status(cached.status_code).json(cached.response);
    }
  }

  const archived = archiveEntity(req.params.id, getActorContext(req));
  if (!archived) return res.status(404).json({ error: "Not found" });

  const response = { entity: archived };
  if (idempotencyKey) {
    storeIdempotentResponse(op, idempotencyKey, 200, response);
  }

  return res.json(response);
});

app.post("/relationships", (req, res) => {
  const op = "POST /relationships";
  const idempotencyKey = parseIdempotency(req);
  if (idempotencyKey) {
    const cached = getIdempotentResponse(op, idempotencyKey);
    if (cached) {
      return res.status(cached.status_code).json(cached.response);
    }
  }

  try {
    const relationship = createRelationship(req.body, getActorContext(req));
    const response = { relationship };
    if (idempotencyKey) {
      storeIdempotentResponse(op, idempotencyKey, 201, response);
    }
    return res.status(201).json(response);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Invalid payload" });
  }
});

app.delete("/relationships/:id", (req, res) => {
  const op = "DELETE /relationships/:id";
  const idempotencyKey = parseIdempotency(req);
  if (idempotencyKey) {
    const cached = getIdempotentResponse(op, idempotencyKey);
    if (cached) {
      return res.status(cached.status_code).json(cached.response);
    }
  }

  const ok = deleteRelationship(req.params.id, getActorContext(req));
  if (!ok) return res.status(404).json({ error: "Not found" });

  const response = { deleted: true };
  if (idempotencyKey) {
    storeIdempotentResponse(op, idempotencyKey, 200, response);
  }

  return res.json(response);
});

app.get("/search", (req, res) => {
  let filters: SearchFilter[] | undefined = undefined;
  if (req.query.filters) {
    try {
      filters = JSON.parse(String(req.query.filters)) as SearchFilter[];
    } catch {
      return res.status(400).json({ error: "Invalid filters JSON" });
    }
  }

  try {
    const result = searchEntities({
      type: req.query.type as any,
      q: req.query.q ? String(req.query.q) : undefined,
      filters,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      sort: req.query.sort ? String(req.query.sort) : undefined,
      order: req.query.order ? String(req.query.order) : undefined,
    });

    return res.json({ results: result });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Invalid query" });
  }
});

app.get("/graph", (req, res) => {
  const entity_id = req.query.entity_id ? String(req.query.entity_id) : null;
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });

  const graph = traverseGraph({
    entity_id,
    direction: req.query.direction as any,
    type: req.query.type ? String(req.query.type) : undefined,
    depth: req.query.depth ? Number(req.query.depth) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });

  return res.json(graph);
});

app.get("/events", (req, res) => {
  const entity_id = req.query.entity_id ? String(req.query.entity_id) : null;
  if (!entity_id) return res.status(400).json({ error: "entity_id required" });

  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const offset = req.query.offset ? Number(req.query.offset) : 0;

  const events = listEvents(entity_id, limit, offset);
  return res.json({ events });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`OpenCRM REST API listening on ${config.port}`);
});
