import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { Pool } from "pg";

const PORT = Number(process.env.PORT || process.env.LOCAL_API_PORT || 3001);
const DB_PATH = process.env.LOCAL_DB_PATH || path.join(process.cwd(), "local-db.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
const USE_POSTGRES = Boolean(DATABASE_URL);
const GROK_API_KEY = process.env.GROK_API_KEY || "";
const GROK_MODEL = process.env.GROK_MODEL || "grok-2-latest";
const GROK_THRESHOLD = Number.parseFloat(process.env.GROK_THRESHOLD || "0.6");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

let pool = null;
let store = null;

const DataType = {
  string: 1,
  number: 2,
  boolean: 3,
  enumeration: 100,
  array: 101,
  object: 102,
  reference: 103,
};

const SimpleSelector = {
  equal: 1,
  not_equal: 2,
  similar: 3,
  not_similar: 4,
  match: 5,
  not_match: 6,
  greater: 7,
  greater_or_equal: 8,
  less: 9,
  less_or_equal: 10,
  in: 11,
  not_in: 12,
  not: 13,
  exists: 14,
  not_exists: 15,
};

const MultiSelector = {
  and: 1,
  or: 2,
  nor: 3,
  all: 4,
  elem_match: 5,
  size: 6,
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000).toString();
}

function entityKey(body) {
  return `${body.namespace}:${body.name}`;
}

function parseValue(value) {
  switch (value.type) {
    case DataType.string:
      return value.string ?? "";
    case DataType.number:
      return value.number ?? 0;
    case DataType.boolean:
      return value.boolean ?? false;
    case DataType.enumeration:
      return value.enumeration ?? 0;
    case DataType.array:
      return Array.isArray(value.array) ? value.array.map((v) => parseValue(v)) : [];
    case DataType.object:
    case DataType.reference: {
      const obj = {};
      for (const field of value.object || []) {
        if (!field.name) continue;
        obj[field.name] = parseValue(field);
      }
      return obj;
    }
    default:
      return "";
  }
}

function valuesToObject(values) {
  const obj = {};
  for (const v of values || []) {
    if (!v.name) continue;
    obj[v.name] = parseValue(v);
  }
  return obj;
}

function determineType(value) {
  if (typeof value === "string") return DataType.string;
  if (typeof value === "number") return DataType.number;
  if (typeof value === "boolean") return DataType.boolean;
  if (Array.isArray(value)) return DataType.array;
  if (value && typeof value === "object") return DataType.object;
  return DataType.string;
}

function objectToValues(obj) {
  const values = [];
  for (const [key, raw] of Object.entries(obj || {})) {
    const type = determineType(raw);
    const value = { type, name: key, object: [], array: [] };
    if (type === DataType.string) value.string = String(raw ?? "");
    if (type === DataType.number) value.number = Number(raw ?? 0);
    if (type === DataType.boolean) value.boolean = Boolean(raw);
    if (type === DataType.enumeration) value.enumeration = Number(raw ?? 0);
    if (type === DataType.array) {
      value.array = (Array.isArray(raw) ? raw : []).map((item, index) => {
        const itemType = determineType(item);
        const itemValue = { type: itemType, name: String(index), object: [], array: [] };
        if (itemType === DataType.string) itemValue.string = String(item ?? "");
        if (itemType === DataType.number) itemValue.number = Number(item ?? 0);
        if (itemType === DataType.boolean) itemValue.boolean = Boolean(item);
        if (itemType === DataType.object) itemValue.object = objectToValues(item);
        return itemValue;
      });
    }
    if (type === DataType.object) value.object = objectToValues(raw);
    values.push(value);
  }
  return values;
}

function dataToObject(data) {
  if (!data) return {};
  if (data.structured) return valuesToObject(data.structured);
  if (data.serialized) {
    try {
      return JSON.parse(data.serialized);
    } catch {
      return {};
    }
  }
  return {};
}

function objectToData(obj) {
  return { structured: objectToValues(obj) };
}

function isEqual(a, b) {
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

function matchesSimpleFilter(record, filter) {
  const recordValue = record[filter.field];
  const filterValue = filter.value ? parseValue(filter.value) : undefined;

  switch (filter.symbol) {
    case SimpleSelector.equal:
      return isEqual(recordValue, filterValue);
    case SimpleSelector.not_equal:
      return !isEqual(recordValue, filterValue);
    case SimpleSelector.greater:
      return Number(recordValue) > Number(filterValue);
    case SimpleSelector.greater_or_equal:
      return Number(recordValue) >= Number(filterValue);
    case SimpleSelector.less:
      return Number(recordValue) < Number(filterValue);
    case SimpleSelector.less_or_equal:
      return Number(recordValue) <= Number(filterValue);
    case SimpleSelector.in:
      return Array.isArray(filterValue) ? filterValue.includes(recordValue) : false;
    case SimpleSelector.not_in:
      return Array.isArray(filterValue) ? !filterValue.includes(recordValue) : true;
    case SimpleSelector.exists:
      return recordValue !== undefined && recordValue !== null;
    case SimpleSelector.not_exists:
      return recordValue === undefined || recordValue === null;
    default:
      return true;
  }
}

function matchesFilter(record, filter) {
  if (!filter) return true;
  const simples = filter.simples || [];
  const multiples = filter.multiples || [];

  for (const simple of simples) {
    if (!matchesSimpleFilter(record, simple)) return false;
  }

  for (const multi of multiples) {
    const subMatches = (multi.value || []).map((sub) => matchesSimpleFilter(record, sub));
    if (multi.symbol === MultiSelector.and && !subMatches.every(Boolean)) return false;
    if (multi.symbol === MultiSelector.or && !subMatches.some(Boolean)) return false;
    if (multi.symbol === MultiSelector.nor && subMatches.some(Boolean)) return false;
  }

  return true;
}

function sortRecords(records, sort) {
  if (!sort || !Array.isArray(sort.orders) || sort.orders.length === 0) return records;
  const orders = sort.orders;
  return [...records].sort((a, b) => {
    for (const order of orders) {
      const dir = order.symbol === 2 ? -1 : 1;
      const av = a[order.field];
      const bv = b[order.field];
      if (av === bv) continue;
      return av > bv ? dir : -dir;
    }
    return 0;
  });
}

function paginateRecords(records, paginate) {
  if (!paginate || paginate.size === 0) {
    return { values: records, page: { number: 0, size: records.length, total: records.length } };
  }
  const pageNumber = Number(paginate.number || 0);
  const pageSize = Number(paginate.size || records.length);
  const start = pageNumber * pageSize;
  const end = start + pageSize;
  return {
    values: records.slice(start, end),
    page: { number: pageNumber, size: pageSize, total: records.length },
  };
}

function loadStore() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && parsed.records ? parsed : { records: {} };
    } catch {
      return { records: {} };
    }
  }
  return { records: {} };
}

function saveStore() {
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2), "utf8");
}

function getEntityMap(entity) {
  if (!store.records[entity]) {
    store.records[entity] = {};
  }
  return store.records[entity];
}

function rowToObject(row) {
  const parsed = typeof row.data_json === "string" ? JSON.parse(row.data_json) : row.data_json;
  return {
    ...parsed,
    id: row.id,
    data_creator: row.data_creator,
    data_updater: row.data_updater,
    create_time: row.create_time,
    update_time: row.update_time,
  };
}

function normalizeConnectionString(input) {
  try {
    const url = new URL(input);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return input;
  }
}

async function initPostgres() {
  const rejectUnauthorized = process.env.PG_REJECT_UNAUTHORIZED === "true";
  const ssl = process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized };
  const connectionString = normalizeConnectionString(DATABASE_URL);
  pool = new Pool({ connectionString, ssl });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      entity_key TEXT NOT NULL,
      id TEXT NOT NULL,
      data_creator TEXT,
      data_updater TEXT,
      create_time TEXT,
      update_time TEXT,
      data_json JSONB NOT NULL,
      PRIMARY KEY (entity_key, id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_records_entity ON records (entity_key);
  `);
}

async function loadRecords(entity) {
  if (USE_POSTGRES) {
    const result = await pool.query("SELECT * FROM records WHERE entity_key = $1", [entity]);
    return result.rows.map(rowToObject);
  }
  const map = getEntityMap(entity);
  return Object.values(map);
}

async function deleteByIds(entity, ids) {
  if (USE_POSTGRES) {
    if (!ids.length) return;
    await pool.query("DELETE FROM records WHERE entity_key = $1 AND id = ANY($2)", [entity, ids]);
    return;
  }
  const map = getEntityMap(entity);
  for (const id of ids) {
    delete map[id];
  }
  saveStore();
}

async function upsertRecord(entity, obj, keepMeta) {
  const now = nowSeconds();
  const id = keepMeta?.id || obj.id || crypto.randomUUID();
  const data_creator = keepMeta?.data_creator || obj.data_creator || "local";
  const create_time = keepMeta?.create_time || obj.create_time || now;
  const data_updater = "local";
  const update_time = now;

  const finalObj = {
    ...obj,
    id,
    data_creator,
    data_updater,
    create_time,
    update_time,
  };

  if (USE_POSTGRES) {
    await pool.query(
      `
        INSERT INTO records (entity_key, id, data_creator, data_updater, create_time, update_time, data_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (entity_key, id) DO UPDATE SET
          data_creator = EXCLUDED.data_creator,
          data_updater = EXCLUDED.data_updater,
          create_time = EXCLUDED.create_time,
          update_time = EXCLUDED.update_time,
          data_json = EXCLUDED.data_json
      `,
      [entity, id, data_creator, data_updater, create_time, update_time, finalObj],
    );
  } else {
    const map = getEntityMap(entity);
    map[id] = finalObj;
    saveStore();
  }

  return finalObj;
}

function findByIndex(records, index) {
  if (!index || !Array.isArray(index.fields) || !Array.isArray(index.values)) return [];
  const indexObj = valuesToObject(index.values);
  return records.filter((record) => index.fields.every((field) => isEqual(record[field], indexObj[field])));
}

function respondWithData(res, records, page) {
  res.json({
    code: 0,
    data: {
      values: records.map((record) => objectToData(record)),
      page,
    },
  });
}

function clampScore(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

app.get("/me", (_req, res) => {
  res.json({ ok: true, userId: "local-user" });
});

async function handleAiEvaluate(req, res) {
  if (!GROK_API_KEY) {
    res.status(503).json({ error: "grok_not_configured" });
    return;
  }

  const { question, idealAnswer, userAnswer, threshold } = req.body || {};
  if (!idealAnswer || !userAnswer) {
    res.status(400).json({ error: "missing_fields" });
    return;
  }

  const scoreThreshold = Number.isFinite(threshold) ? threshold : GROK_THRESHOLD;

  const prompt = `Evaluate semantic similarity between the ideal answer and the user answer for the question.
Return only JSON with fields: score (0 to 1) and feedback (short).
Accept paraphrases and different wording if meaning matches.

Question: ${question || ""}
Ideal answer: ${idealAnswer}
User answer: ${userAnswer}`;

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "Return only JSON. No extra text.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(502).json({ error: "grok_request_failed", detail: text });
      return;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = parseJsonObject(content);
    const score = clampScore(Number(parsed?.score));
    const feedback = typeof parsed?.feedback === "string" ? parsed.feedback : "Answer evaluated.";
    const correct = score >= scoreThreshold;

    res.json({ correct, score, feedback });
  } catch (error) {
    console.error("Grok evaluation failed:", error);
    res.status(500).json({ error: "grok_unavailable" });
  }
}

app.post("/ai/evaluate", handleAiEvaluate);
app.post("/api/ai/evaluate", handleAiEvaluate);

app.post("/data/store/v1/all", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const records = await loadRecords(entity);
    respondWithData(res, records);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/insert", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const batch = req.body.batch || (req.body.data ? [req.body.data] : []);
    const inserted = [];
    for (const data of batch) {
      inserted.push(await upsertRecord(entity, dataToObject(data)));
    }
    respondWithData(res, inserted);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/purge", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    if (USE_POSTGRES) {
      await pool.query("DELETE FROM records WHERE entity_key = $1", [entity]);
    } else {
      store.records[entity] = {};
      saveStore();
    }
    respondWithData(res, []);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/get", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const records = await loadRecords(entity);
    let matches = [];
    if (Array.isArray(req.body.ids) && req.body.ids.length > 0) {
      matches = records.filter((record) => req.body.ids.includes(record.id));
    } else if (req.body.index) {
      matches = findByIndex(records, req.body.index);
    }
    respondWithData(res, matches);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/set", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const records = await loadRecords(entity);
    const matches = findByIndex(records, req.body.index);
    const existing = matches[0];
    const updated = await upsertRecord(entity, dataToObject(req.body.data), existing);
    respondWithData(res, [updated]);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/delete", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    if (Array.isArray(req.body.ids) && req.body.ids.length > 0) {
      await deleteByIds(entity, req.body.ids);
      respondWithData(res, []);
      return;
    }
    if (req.body.index) {
      const records = await loadRecords(entity);
      const matches = findByIndex(records, req.body.index);
      const ids = matches.map((record) => record.id);
      await deleteByIds(entity, ids);
    }
    respondWithData(res, []);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/mget", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const records = await loadRecords(entity);
    const indexes = req.body.indexes || [];
    const results = indexes.flatMap((index) => findByIndex(records, index));
    respondWithData(res, results);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/mset", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const records = await loadRecords(entity);
    const indexes = req.body.indexes || [];
    const dataBatch = req.body.data || [];
    const updated = [];
    for (let i = 0; i < dataBatch.length; i += 1) {
      const existing = findByIndex(records, indexes[i])[0];
      updated.push(await upsertRecord(entity, dataToObject(dataBatch[i]), existing));
    }
    respondWithData(res, updated);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/list", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const records = await loadRecords(entity);
    const filtered = records.filter((record) => matchesFilter(record, req.body.filter));
    const sorted = sortRecords(filtered, req.body.sort);
    const { values, page } = paginateRecords(sorted, req.body.paginate);
    respondWithData(res, values, page);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/increase_counter", async (req, res, next) => {
  try {
    const entity = entityKey(req.body);
    const records = await loadRecords(entity);
    const matches = findByIndex(records, req.body.index);
    const record = matches[0];
    if (!record) {
      respondWithData(res, []);
      return;
    }
    const delta = Number(req.body.delta || 1);
    const counterValue = Number(record.counter || 0) + delta;
    record.counter = counterValue;
    const updated = await upsertRecord(entity, record, record);
    respondWithData(res, [updated]);
  } catch (err) {
    next(err);
  }
});

app.post("/data/store/v1/count_ranked_list", (_req, res) => {
  respondWithData(res, []);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

if (USE_POSTGRES) {
  await initPostgres();
} else {
  store = loadStore();
}

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  if (USE_POSTGRES) {
    console.log("Using Postgres storage");
  } else {
    console.log(`Using local DB file at ${DB_PATH}`);
  }
});
