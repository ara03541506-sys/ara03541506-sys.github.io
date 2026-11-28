import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";
import { resolveShoe } from "../assets/js/shoe-names.mjs";

const models = new Map([
  ["nikepegasus41", { id: "pegasus-41", canonical_name: "NIKE Pegasus 41", normalized_name: "nikepegasus41", manufacturer: "NIKE", model_name: "Pegasus 41" }],
  ["nikevaporfly3", { id: "vaporfly-3", canonical_name: "NIKE Vaporfly 3", normalized_name: "nikevaporfly3", manufacturer: "NIKE", model_name: "Vaporfly 3" }],
  ["nikevaporfly4", { id: "vaporfly-4", canonical_name: "NIKE Vaporfly 4", normalized_name: "nikevaporfly4", manufacturer: "NIKE", model_name: "Vaporfly 4" }],
  ["ペガサス41", { id: "legacy-pegasus", canonical_name: "ペガサス41", normalized_name: "ペガサス41", manufacturer: null, model_name: null }]
]);
const records = new Map();
let saveFails = false;
const db = {
  rpc(name, args) {
    if (name === "save_shoe_lifespan_submission") {
      if (saveFails) return Promise.resolve({ data: null, error: { message: "Test failure" } });
      const old = records.get(args.p_request_id);
      if (old && old.contributor_hash !== args.p_contributor_hash) return Promise.resolve({ data: false, error: null });
      records.set(args.p_request_id, { ...(old || { request_id: args.p_request_id, status: "accepted",
        source_hash: args.p_contributor_hash, contributor_hash: args.p_contributor_hash }),
        shoe_model_id: args.p_shoe_model_id, distance_km: args.p_distance_km });
      return Promise.resolve({ data: true, error: null });
    }
    assert.equal(name, "get_shoe_catalog");
    return { range: async (from, to) => ({ data: [...models.values()].slice(from, to + 1), error: null }) };
  },
  from(table) {
    if (table === "shoe_models") return {
      upsert: async (row) => {
        if (!models.has(row.normalized_name)) models.set(row.normalized_name, { ...row, id: webcrypto.randomUUID() });
        return { error: null };
      },
      select: () => ({ eq: (_column, value) => ({ single: async () => ({ data: models.get(value), error: null }) }) }),
      update: (values) => ({ eq: async (_column, id) => {
        Object.assign([...models.values()].find((row) => row.id === id), values);
        return { error: null };
      } })
    };
    assert.equal(table, "shoe_lifespan_submissions");
    return { insert: async (row) => {
      if (records.has(row.request_id)) return { error: { code: "23505" } };
      records.set(row.request_id, row);
      return { error: null };
    } };
  }
};

let handler;
const env = { SUPABASE_URL: "https://example.supabase.co", SHOE_STATS_SECRET_KEY: "test-secret", SHOE_STATS_PUBLISHABLE_KEY: "test-public" };
const source = fs.readFileSync(new URL("../supabase/functions/submit-shoe-lifespan/index.ts", import.meta.url), "utf8")
  .replace(/^import[^\n]+\n/gm, "");
const context = vm.createContext({
  Deno: { env: { get: (key) => env[key] }, serve: (callback) => { handler = callback; } },
  createClient: () => db, resolveShoe, crypto: webcrypto, TextEncoder, Response, console
});
new vm.Script(stripTypeScriptTypes(source)).runInContext(context);

async function submit(manufacturer, modelName, extra = {}) {
  const requestId = extra.requestId || webcrypto.randomUUID();
  const body = { requestId, clientId: "423d1795-d795-4a59-a1d9-31e5bb01f8ec", manufacturer, modelName,
    shoeName: `${manufacturer} ${modelName}`, distanceKm: 650, consent: true, ...extra };
  const response = await handler(new Request("https://example.supabase.co/functions/v1/submit-shoe-lifespan", {
    method: "POST", headers: { Origin: "https://ara03541506-sys.github.io", apikey: "test-public", "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }));
  return { response, data: await response.json(), requestId };
}

const before = models.size;
const japanese = await submit("ナイキ", "ぺがさす４１");
assert.equal(japanese.response.status, 201);
assert.equal(japanese.data.shoe.shoeName, "NIKE Pegasus 41");
assert.equal(records.get(japanese.requestId).shoe_model_id, "pegasus-41");
assert.equal(models.size, before);
const duplicate = await submit("ＮＩＫＥ", "ＰＥＧＡＳＵＳ４１", { requestId: japanese.requestId });
assert.equal(duplicate.response.status, 200);
assert.equal(duplicate.data.duplicate, true);
assert.equal(records.size, 1);

const generation = await submit("nike", "ヴェイパーフライ４");
assert.equal(generation.response.status, 201);
assert.equal(records.get(generation.requestId).shoe_model_id, "vaporfly-4");
assert.equal(generation.data.shoe.modelName, "Vaporfly 4");
const unknown = await submit("NIKE", "Vaporfly 5");
assert.equal(unknown.response.status, 201);
assert.notEqual(records.get(unknown.requestId).shoe_model_id, "vaporfly-4");
assert.equal(unknown.data.shoe.modelName, "Vaporfly 5");
const typo = await submit("NIKE", "Pegaus 41");
assert.equal(typo.data.shoe.modelName, "Pegaus 41");
assert.notEqual(records.get(typo.requestId).shoe_model_id, "pegasus-41");

const legacy = await submit(undefined, undefined, { shoeName: "ペガサス41" });
assert.equal(legacy.response.status, 201);
assert.equal(records.get(legacy.requestId).shoe_model_id, "legacy-pegasus");
const count = records.size;
const invalid = await submit("adidas", "ADIZERO EVO SL", { shoeName: "NIKE Pegasus 41" });
assert.equal(invalid.response.status, 400);
assert.equal(records.size, count);
console.log("PASS: Edge Function reuses canonical model IDs, returns canonical spelling, preserves generations and legacy retries, and avoids fuzzy/duplicate merges");

const beforeEdit = records.size;
const changed = await submit("NIKE", "Vaporfly 4", { requestId: japanese.requestId, action: "save", distanceKm: 875 });
assert.equal(changed.response.status, 200);
assert.equal(changed.data.saved, true);
assert.equal(records.size, beforeEdit);
assert.equal(records.get(japanese.requestId).shoe_model_id, "vaporfly-4");
assert.equal(records.get(japanese.requestId).distance_km, 875);
const foreign = await submit("NIKE", "Pegasus 41", { requestId: japanese.requestId, action: "save", distanceKm: 200,
  clientId: "f16d84bb-5c39-41af-955b-60eed4b676c1" });
assert.equal(foreign.response.status, 403);
assert.equal(foreign.data.error, "record_not_owned");
assert.equal(records.get(japanese.requestId).distance_km, 875);
records.get(japanese.requestId).status = "excluded";
const moderated = await submit("NIKE", "Pegasus 41", { requestId: japanese.requestId, action: "save", distanceKm: 700 });
assert.equal(moderated.response.status, 200);
assert.equal(records.get(japanese.requestId).status, "excluded");
const recover = await submit("NIKE", "Pegasus 41", { action: "save", distanceKm: 500 });
assert.equal(recover.response.status, 200);
const afterRecover = records.size;
const replay = await submit("NIKE", "Pegasus 41", { requestId: recover.requestId, action: "save", distanceKm: 500 });
assert.equal(replay.response.status, 200);
assert.equal(records.size, afterRecover);
saveFails = true;
const unavailable = await submit("NIKE", "Pegasus 41", { requestId: recover.requestId, action: "save", distanceKm: 600 });
assert.equal(unavailable.response.status, 500);
assert.equal(records.get(recover.requestId).distance_km, 500);
saveFails = false;
const invalidAction = await submit("NIKE", "Pegasus 41", { action: "delete" });
assert.equal(invalidAction.response.status, 400);
console.log("PASS: owned record updates without duplicates, foreign edits denied, moderation preserved, recovery after failed creation, idempotent retries and storage failure");
