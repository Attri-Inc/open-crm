import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";
import { config } from "./config.js";
import {
  ActorContext,
  Entity,
  EntityType,
  EventRecord,
  EventType,
  FieldProvenanceEntry,
  GraphQuery,
  Provenance,
  Relationship,
  SearchFilter,
  SearchParams,
  VerificationStatus,
} from "./models.js";

const db = initDb();

function initDb() {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const database = new Database(config.dbPath);
  database.pragma("journal_mode = WAL");

  database.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      properties TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      confidence REAL,
      verification TEXT,
      provenance TEXT
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL,
      metadata TEXT,
      confidence REAL,
      verification TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      diff TEXT,
      actor TEXT,
      prompt_hash TEXT,
      tool_call_id TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS field_provenance (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      field_path TEXT NOT NULL,
      provenance TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency (
      key TEXT NOT NULL,
      operation TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (key, operation)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(
      entity_id UNINDEXED,
      content
    );

    CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
    CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id);
  `);

  return database;
}

export function nowIso() {
  return new Date().toISOString();
}

export function generateId() {
  return ulid();
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toEntity(row: any): Entity {
  return {
    id: row.id,
    type: row.type,
    properties: parseJson(row.properties, {}),
    schema_version: row.schema_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.status,
    summary: row.summary,
    confidence: row.confidence,
    verification: row.verification,
    provenance: parseJson(row.provenance, null),
  };
}

function toRelationship(row: any): Relationship {
  return {
    id: row.id,
    from_id: row.from_id,
    to_id: row.to_id,
    type: row.type,
    metadata: parseJson(row.metadata, null),
    confidence: row.confidence,
    verification: row.verification,
    created_at: row.created_at,
  };
}

function toEvent(row: any): EventRecord {
  return {
    event_id: row.event_id,
    entity_id: row.entity_id,
    event_type: row.event_type,
    diff: parseJson(row.diff, null),
    actor: row.actor,
    prompt_hash: row.prompt_hash,
    tool_call_id: row.tool_call_id,
    timestamp: row.timestamp,
  };
}

function collectStringLike(value: unknown, out: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringLike(item, out);
    }
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStringLike(item, out);
    }
  }
}

function buildFtsContent(entity: Entity): string {
  const parts: string[] = [];
  if (entity.summary) parts.push(entity.summary);
  collectStringLike(entity.properties, parts);
  return parts.join(" ");
}

function upsertFts(entity: Entity) {
  const content = buildFtsContent(entity);
  const deleteStmt = db.prepare("DELETE FROM entity_fts WHERE entity_id = ?");
  const insertStmt = db.prepare(
    "INSERT INTO entity_fts(entity_id, content) VALUES (?, ?)"
  );
  const tx = db.transaction(() => {
    deleteStmt.run(entity.id);
    insertStmt.run(entity.id, content);
  });
  tx();
}

function recordEvent(
  entityId: string,
  eventType: EventType,
  diff: unknown,
  context?: ActorContext
) {
  const event: EventRecord = {
    event_id: generateId(),
    entity_id: entityId,
    event_type: eventType,
    diff,
    actor: context?.actor ?? null,
    prompt_hash: context?.prompt_hash ?? null,
    tool_call_id: context?.tool_call_id ?? null,
    timestamp: nowIso(),
  };

  db.prepare(
    `INSERT INTO events(event_id, entity_id, event_type, diff, actor, prompt_hash, tool_call_id, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.event_id,
    event.entity_id,
    event.event_type,
    JSON.stringify(event.diff ?? null),
    event.actor,
    event.prompt_hash,
    event.tool_call_id,
    event.timestamp
  );
}

export function getEntity(id: string): Entity | null {
  const row = db.prepare("SELECT * FROM entities WHERE id = ?").get(id);
  return row ? toEntity(row) : null;
}

export function listEntityFieldProvenance(entityId: string): FieldProvenanceEntry[] {
  const rows = db
    .prepare("SELECT * FROM field_provenance WHERE entity_id = ?")
    .all(entityId);
  return rows.map((row) => ({
    id: row.id,
    entity_id: row.entity_id,
    field_path: row.field_path,
    provenance: parseJson(row.provenance, {}),
  }));
}

function upsertFieldProvenance(
  entityId: string,
  entries: { field_path: string; provenance: Provenance }[]
) {
  const deleteStmt = db.prepare(
    "DELETE FROM field_provenance WHERE entity_id = ? AND field_path = ?"
  );
  const insertStmt = db.prepare(
    "INSERT INTO field_provenance(id, entity_id, field_path, provenance) VALUES (?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    for (const entry of entries) {
      deleteStmt.run(entityId, entry.field_path);
      insertStmt.run(
        generateId(),
        entityId,
        entry.field_path,
        JSON.stringify(entry.provenance ?? {})
      );
    }
  });

  transaction();
}

export function createEntity(input: {
  id?: string;
  type: EntityType;
  properties?: Record<string, unknown>;
  summary?: string | null;
  confidence?: number | null;
  verification?: VerificationStatus | null;
  provenance?: Provenance | null;
  status?: "active" | "archived";
  schema_version?: string;
  field_provenance?: { field_path: string; provenance: Provenance }[];
}, context?: ActorContext): Entity {
  const now = nowIso();
  const entity: Entity = {
    id: input.id ?? generateId(),
    type: input.type,
    properties: input.properties ?? {},
    schema_version: input.schema_version ?? config.schemaVersion,
    created_at: now,
    updated_at: now,
    status: input.status ?? "active",
    summary: input.summary ?? null,
    confidence: input.confidence ?? null,
    verification: input.verification ?? null,
    provenance: input.provenance ?? null,
  };

  db.prepare(
    `INSERT INTO entities(
      id, type, properties, schema_version, created_at, updated_at, status,
      summary, confidence, verification, provenance
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entity.id,
    entity.type,
    JSON.stringify(entity.properties),
    entity.schema_version,
    entity.created_at,
    entity.updated_at,
    entity.status,
    entity.summary,
    entity.confidence,
    entity.verification,
    JSON.stringify(entity.provenance ?? null)
  );

  if (input.field_provenance && input.field_provenance.length > 0) {
    upsertFieldProvenance(entity.id, input.field_provenance);
  }

  upsertFts(entity);
  recordEvent(entity.id, "create", { after: entity }, context);

  return entity;
}

export function updateEntity(
  id: string,
  patch: {
    properties?: Record<string, unknown>;
    replace_properties?: boolean;
    summary?: string | null;
    confidence?: number | null;
    verification?: VerificationStatus | null;
    provenance?: Provenance | null;
    status?: "active" | "archived";
    field_provenance?: { field_path: string; provenance: Provenance }[];
  },
  context?: ActorContext
): Entity | null {
  const current = getEntity(id);
  if (!current) return null;

  const nextProperties = patch.replace_properties
    ? patch.properties ?? {}
    : { ...current.properties, ...(patch.properties ?? {}) };

  const updated: Entity = {
    ...current,
    properties: nextProperties,
    summary: patch.summary ?? current.summary ?? null,
    confidence: patch.confidence ?? current.confidence ?? null,
    verification: patch.verification ?? current.verification ?? null,
    provenance: patch.provenance ?? current.provenance ?? null,
    status: patch.status ?? current.status,
    updated_at: nowIso(),
  };

  db.prepare(
    `UPDATE entities SET
      properties = ?,
      updated_at = ?,
      status = ?,
      summary = ?,
      confidence = ?,
      verification = ?,
      provenance = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(updated.properties),
    updated.updated_at,
    updated.status,
    updated.summary,
    updated.confidence,
    updated.verification,
    JSON.stringify(updated.provenance ?? null),
    updated.id
  );

  if (patch.field_provenance && patch.field_provenance.length > 0) {
    upsertFieldProvenance(updated.id, patch.field_provenance);
  }

  upsertFts(updated);
  recordEvent(updated.id, "update", { before: current, after: updated }, context);

  return updated;
}

export function archiveEntity(id: string, context?: ActorContext): Entity | null {
  return updateEntity(id, { status: "archived" }, context);
}

export function createRelationship(input: {
  id?: string;
  from_id: string;
  to_id: string;
  type: string;
  metadata?: Record<string, unknown> | null;
  confidence?: number | null;
  verification?: VerificationStatus | null;
}, context?: ActorContext): Relationship {
  const relationship: Relationship = {
    id: input.id ?? generateId(),
    from_id: input.from_id,
    to_id: input.to_id,
    type: input.type,
    metadata: input.metadata ?? null,
    confidence: input.confidence ?? null,
    verification: input.verification ?? null,
    created_at: nowIso(),
  };

  db.prepare(
    `INSERT INTO relationships(
      id, from_id, to_id, type, metadata, confidence, verification, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    relationship.id,
    relationship.from_id,
    relationship.to_id,
    relationship.type,
    JSON.stringify(relationship.metadata ?? null),
    relationship.confidence,
    relationship.verification,
    relationship.created_at
  );

  recordEvent(relationship.id, "create", { relationship }, context);

  return relationship;
}

export function deleteRelationship(id: string, context?: ActorContext): boolean {
  const existing = db
    .prepare("SELECT * FROM relationships WHERE id = ?")
    .get(id);
  if (!existing) return false;

  db.prepare("DELETE FROM relationships WHERE id = ?").run(id);
  recordEvent(id, "delete", { relationship: existing }, context);
  return true;
}

function validateFilterField(field: string): { sql: string; valueField: string } {
  const baseFields = new Set([
    "id",
    "type",
    "status",
    "created_at",
    "updated_at",
    "confidence",
    "verification",
    "summary",
  ]);

  if (baseFields.has(field)) {
    return { sql: `e.${field}`, valueField: field };
  }

  if (field.startsWith("properties.")) {
    const key = field.slice("properties.".length);
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      throw new Error("Invalid properties field");
    }
    return { sql: `json_extract(e.properties, '$.${key}')`, valueField: key };
  }

  throw new Error(`Unsupported field: ${field}`);
}

function buildFilterSql(filters: SearchFilter[], values: unknown[]) {
  const clauses: string[] = [];

  for (const filter of filters) {
    const allowedOps = new Set(["=", "!=", ">", ">=", "<", "<=", "LIKE"]);
    if (!allowedOps.has(filter.op)) {
      throw new Error(`Unsupported op: ${filter.op}`);
    }

    const { sql } = validateFilterField(filter.field);
    clauses.push(`${sql} ${filter.op} ?`);
    values.push(filter.value);
  }

  return clauses;
}

export function searchEntities(params: SearchParams) {
  const values: unknown[] = [];
  const where: string[] = [];
  const joins: string[] = [];

  if (params.type) {
    where.push("e.type = ?");
    values.push(params.type);
  }

  if (params.q) {
    joins.push("JOIN entity_fts fts ON fts.entity_id = e.id");
    where.push("fts MATCH ?");
    values.push(params.q);
  }

  if (params.filters && params.filters.length > 0) {
    const clauses = buildFilterSql(params.filters, values);
    where.push(...clauses);
  }

  const sort = params.sort ? validateFilterField(params.sort).sql : "e.updated_at";
  const order = params.order?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const sql = `
    SELECT e.*
    FROM entities e
    ${joins.join(" ")}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${sort} ${order}
    LIMIT ? OFFSET ?
  `;

  values.push(limit, offset);

  const rows = db.prepare(sql).all(...values);
  return rows.map(toEntity);
}

export function traverseGraph(query: GraphQuery) {
  const direction = query.direction ?? "both";
  const depth = Math.min(Math.max(query.depth ?? 1, 1), 3);
  const limit = Math.min(query.limit ?? 100, 500);
  const relType = query.type;

  const visited = new Set<string>();
  const edges: Relationship[] = [];
  const nodes = new Map<string, Entity>();

  let frontier = [query.entity_id];
  visited.add(query.entity_id);

  for (let level = 0; level < depth; level += 1) {
    const nextFrontier: string[] = [];

    for (const entityId of frontier) {
      if (edges.length >= limit) break;

      const clauses: string[] = [];
      const values: unknown[] = [];

      if (direction === "out" || direction === "both") {
        clauses.push("from_id = ?");
        values.push(entityId);
      }
      if (direction === "in" || direction === "both") {
        clauses.push("to_id = ?");
        values.push(entityId);
      }

      if (clauses.length === 0) continue;
      const directionSql = clauses.length > 1 ? `(${clauses.join(" OR ")})` : clauses[0];
      const whereParts = [directionSql];
      if (relType) {
        whereParts.push("type = ?");
        values.push(relType);
      }

      const sql = `SELECT * FROM relationships WHERE ${whereParts.join(" AND ")}`;
      const relRows = db.prepare(sql).all(...values);

      for (const row of relRows) {
        if (edges.length >= limit) break;
        const rel = toRelationship(row);
        edges.push(rel);

        const otherId = rel.from_id === entityId ? rel.to_id : rel.from_id;
        if (!visited.has(otherId)) {
          visited.add(otherId);
          nextFrontier.push(otherId);
        }
      }
    }

    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  const uniqueIds = Array.from(visited);
  for (const id of uniqueIds) {
    const entity = getEntity(id);
    if (entity) nodes.set(id, entity);
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

export function listEvents(entityId: string, limit = 50, offset = 0) {
  const rows = db
    .prepare(
      "SELECT * FROM events WHERE entity_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    )
    .all(entityId, limit, offset);
  return rows.map(toEvent);
}

export function getIdempotentResponse(operation: string, key: string) {
  const row = db
    .prepare(
      "SELECT status_code, response_json FROM idempotency WHERE key = ? AND operation = ?"
    )
    .get(key, operation);
  if (!row) return null;
  return {
    status_code: row.status_code,
    response: parseJson(row.response_json, null),
  };
}

export function storeIdempotentResponse(
  operation: string,
  key: string,
  statusCode: number,
  response: unknown
) {
  db.prepare(
    `INSERT OR REPLACE INTO idempotency(key, operation, status_code, response_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(key, operation, statusCode, JSON.stringify(response), nowIso());
}
