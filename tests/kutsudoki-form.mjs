import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import * as shoeNames from "../assets/js/shoe-names.mjs";

const html = fs.readFileSync(new URL("../_site/running/shoe-lifespan.html", import.meta.url), "utf8");
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1]).find((script) => script.includes("shoeLifespanRecordsV2"))
  .replace(/^import \* as shoeNames from [^\n]+;\s*/m, "");
// API fixtures for behavior tests; the app itself has no bundled shoe list.
const catalogFixture = [
  { manufacturer: "NIKE", model_name: "Pegasus 41", shoe_name: "NIKE Pegasus 41" },
  { manufacturer: "NIKE", model_name: "Vaporfly 3", shoe_name: "NIKE Vaporfly 3" },
  { manufacturer: "adidas", model_name: "ADIZERO EVO SL", shoe_name: "adidas ADIZERO EVO SL" }
];
assert.ok(!html.includes("data-shoe-catalog"));
assert.ok(!fs.existsSync(new URL("../_data/shoe_catalog.yml", import.meta.url)));
assert.ok(html.includes("シューズの記録は統計に利用しています"));
assert.ok(/<header[^>]*class="shoe-tool__hero[\s\S]*?class="shoe-tool__notice"[\s\S]*?href="\/running\/privacypolicy.html"[\s\S]*?<\/header>/.test(html));
assert.ok(!html.includes('id="share-stats"'));

class Element {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.handlers = {};
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.attributes = {};
  }
  set innerHTML(value) {
    this.children = [];
    if (this.id === "manufacturer" || this.id === "shoe-name") this.value = "";
    for (const match of value.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)) {
      const child = new Element();
      child.textContent = match[2];
      this.children.push(child);
    }
  }
  get options() { return this.children; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  focus() { this.focused = true; }
  scrollIntoView() {}
  addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
  async emit(type, properties = {}) {
    for (const handler of this.handlers[type] || []) await handler({ preventDefault() {}, ...properties });
  }
}

async function startApp(saved = [], enabled = false, communityStats = [], settings = {}) {
  const ids = ["record-form", "record-heading", "submit-record", "cancel-edit", "clear-all", "form-status",
    "records-body", "personal-stats-body", "community-stats-body", "community-status",
    "community-tab-top", "community-tab-search", "community-stats-panel", "community-search-controls", "community-search",
    "manufacturer", "shoe-name", "custom-manufacturer", "custom-shoe-name",
    "custom-manufacturer-wrap", "custom-shoe-name-wrap", "manufacturer-name-options", "model-name-suggestions", "distance", "pair-label"];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element(id)]));
  const storage = new Map([["shoeLifespanRecordsV2", JSON.stringify(saved)]]);
  const config = { dataset: { supabaseUrl: enabled ? "https://example.supabase.co" : "", supabasePublishableKey: enabled ? "test-public-key" : "" } };
  const fields = { manufacturer: "manufacturer", shoeModel: "shoe-name", customShoeModel: "custom-shoe-name", distance: "distance", pairLabel: "pair-label" };
  const sent = [];
  const requests = [];
  const warnings = [];
  elements["record-form"].reset = () => {
    for (const id of ["manufacturer", "shoe-name", "custom-manufacturer", "custom-shoe-name", "distance", "pair-label"]) elements[id].value = "";
  };
  const context = vm.createContext({
    shoeNames,
    console: { ...console, warn: (...args) => warnings.push(args) }, crypto: webcrypto, window: { crypto: webcrypto, confirm: () => true },
    document: { querySelector: () => config, getElementById: (id) => elements[id], createElement: () => new Element() },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    FormData: class { get(name) { return elements[fields[name]]?.value || ""; } },
    fetch: async (url, options = {}) => {
      requests.push(url);
      if (options.method === "POST") sent.push(JSON.parse(options.body));
      if (url.includes("/rpc/get_shoe_catalog")) {
        if (settings.catalogGate) await settings.catalogGate;
        const offset = Number(new URL(url).searchParams.get("offset"));
        return {
          ok: !settings.catalogFailure,
          status: settings.catalogFailure ? 503 : 200,
          json: async () => (settings.catalog || catalogFixture).slice(offset, offset + 1000)
        };
      }
      if (url.includes("/rest/v1/shoe_lifespan_stats")) {
        const offset = Number(new URL(url).searchParams.get("offset"));
        return { ok: !settings.statsFailure, status: settings.statsFailure ? 503 : 200,
          json: async () => communityStats.slice(offset, offset + (settings.statsPageSize || 1000)) };
      }
      return { ok: !settings.submitFailure, status: settings.submitFailure ? 500 : 201,
        json: async () => settings.submitFailure ? { error: "storage_error" } : { ok: true, shoe: settings.canonicalResponse } };
    }
  });
  new vm.Script(source).runInContext(context);
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, storage, sent, requests, warnings };
}

const legacy = { id: "7529e394-f7f0-4d81-9ee3-3ce9ec04d675", shoeName: "Nike Pegasus 41", distance: 500, shareStatus: "private" };
const app = await startApp([legacy, { ...legacy, id: "old-unknown", shoeName: "旧シューズ" },
  { ...legacy, id: "old-adidas", shoeName: "adidas ADIZERO EVO SL" }]);
const e = app.elements;
assert.equal(e["shoe-name"].disabled, true);
assert.equal(e["records-body"].children[0].children[0].textContent, "NIKE");
assert.equal(e["records-body"].children[0].children[1].textContent, "Pegasus 41");
assert.equal(e["records-body"].children[1].children[1].textContent, "旧シューズ");

e.manufacturer.value = "NIKE";
await e.manufacturer.emit("change");
assert.ok(e["shoe-name"].options.some((option) => option.value === "Pegasus 41"));
assert.ok(!e["shoe-name"].options.some((option) => option.value === "ADIZERO EVO SL"));
e["shoe-name"].value = "Pegasus 41";
e.manufacturer.value = "adidas";
await e.manufacturer.emit("change");
assert.equal(e["shoe-name"].value, "");
assert.ok(e["shoe-name"].options.some((option) => option.value === "ADIZERO EVO SL"));

e.manufacturer.value = "__custom__";
await e.manufacturer.emit("change");
e["custom-manufacturer"].value = "My Brand";
await e["custom-manufacturer"].emit("input");
e["shoe-name"].value = "__custom__";
await e["shoe-name"].emit("change");
assert.equal(e["custom-shoe-name"].required, true);
e["custom-shoe-name"].value = "Daily Runner";
e.distance.value = "650";
await e["record-form"].emit("submit");
const stored = JSON.parse(app.storage.get("shoeLifespanRecordsV2"));
assert.equal(stored[0].manufacturer, "My Brand");
assert.equal(stored[0].modelName, "Daily Runner");
assert.equal(stored[0].shoeName, "My Brand Daily Runner");
assert.equal(stored[0].structuredNames, true);
assert.equal(stored[1].shoeName, legacy.shoeName);
assert.equal(app.sent.length, 0);
assert.equal(e["shoe-name"].disabled, true);
assert.equal(e["custom-shoe-name"].disabled, true);

const reloaded = await startApp(stored, true);
const r = reloaded.elements;
r.manufacturer.value = "My Brand";
await r.manufacturer.emit("change");
assert.ok(r["shoe-name"].options.some((option) => option.value === "Daily Runner"));
r["shoe-name"].value = "Daily Runner";
r.distance.value = "700";
await r["record-form"].emit("submit");
assert.equal(reloaded.sent.length, 1);
assert.equal(reloaded.sent[0].manufacturer, "My Brand");
assert.equal(reloaded.sent[0].modelName, "Daily Runner");
assert.equal(reloaded.sent[0].shoeName, "My Brand Daily Runner");
assert.equal(reloaded.sent[0].consent, true);
assert.equal(JSON.parse(reloaded.storage.get("shoeLifespanRecordsV2"))[0].shareStatus, "shared");

const retryApp = await startApp([{ ...legacy, shareStatus: "failed" }], true);
await retryApp.elements["records-body"].children[0].children[4].children[0].children[0].emit("click");
assert.equal(retryApp.sent[0].shoeName, "Nike Pegasus 41");
assert.equal(retryApp.sent[0].manufacturer, undefined);
assert.equal(retryApp.sent[0].requestId, legacy.id);

const privateApp = await startApp([legacy], true);
assert.equal(privateApp.sent.length, 0);
assert.equal(privateApp.elements["records-body"].children[0].children[4].children[0].textContent, "提供なし");

const failedApp = await startApp([], true, [], { submitFailure: true });
failedApp.elements.manufacturer.value = "NIKE";
await failedApp.elements.manufacturer.emit("change");
failedApp.elements["shoe-name"].value = "Pegasus 41";
failedApp.elements.distance.value = "650";
await failedApp.elements["record-form"].emit("submit");
assert.equal(failedApp.sent.length, 1);
assert.equal(failedApp.sent[0].consent, true);
assert.equal(JSON.parse(failedApp.storage.get("shoeLifespanRecordsV2"))[0].shareStatus, "failed");
assert.equal(failedApp.elements["submit-record"].disabled, false);

const communityApp = await startApp([], true, [{ shoe_name: "NIKE Community Model", sample_count: 1, average_km: 600, median_km: 600, minimum_km: 600, maximum_km: 600 }]);
communityApp.elements.manufacturer.value = "NIKE";
await communityApp.elements.manufacturer.emit("change");
assert.ok(communityApp.elements["shoe-name"].options.some((option) => option.value === "Community Model"));
assert.equal(communityApp.elements["community-stats-body"].children[0].children[0].textContent, "NIKE");
assert.equal(communityApp.elements["community-stats-body"].children[0].children[1].textContent, "Community Model");
assert.equal(communityApp.elements["community-stats-body"].children[0].children[2].textContent, "1");
console.log("PASS: dependent dropdowns, brand change, manual entries, legacy records/retries, local persistence, reset, community choices and structured API submission");

// A different browser with no personal records or published statistics still
// receives contributed names, including brands absent from the starter list.
const names = [
  { manufacturer: "Shared Brand", model_name: "Handmade Runner", shoe_name: "Shared Brand Handmade Runner" },
  { manufacturer: "SHARED BRAND", model_name: "handmade runner", shoe_name: "SHARED BRAND handmade runner" },
  { manufacturer: "NIKE", model_name: "PEGASUS 41", shoe_name: "NIKE PEGASUS 41" }
];
const sharedApp = await startApp([], true, [], { catalog: names });
assert.equal(sharedApp.elements.manufacturer.options.filter((option) => option.value.toLowerCase() === "shared brand").length, 1);
sharedApp.elements.manufacturer.value = "Shared Brand";
await sharedApp.elements.manufacturer.emit("change");
assert.equal(sharedApp.elements["shoe-name"].options.filter((option) => option.value.toLowerCase() === "handmade runner").length, 1);
sharedApp.elements.manufacturer.value = "NIKE";
await sharedApp.elements.manufacturer.emit("change");
assert.equal(sharedApp.elements["shoe-name"].options.filter((option) => option.value.toLowerCase() === "pegasus 41").length, 1);
assert.equal(sharedApp.elements["community-stats-body"].children[0].children[0].textContent, "登録されているシューズはまだありません");

const manyNames = Array.from({ length: 1001 }, (_, i) => ({ manufacturer: "Large Brand", model_name: `Model ${i}`, shoe_name: `Large Brand Model ${i}` }));
const pagedApp = await startApp([], true, [], { catalog: manyNames });
pagedApp.elements.manufacturer.value = "Large Brand";
await pagedApp.elements.manufacturer.emit("change");
assert.ok(pagedApp.elements["shoe-name"].options.some((option) => option.value === "Model 1000"));
assert.ok(pagedApp.requests.some((url) => url.includes("offset=1000")));

const unavailableApp = await startApp([legacy], true, [], { catalogFailure: true });
unavailableApp.elements.manufacturer.value = "NIKE";
await unavailableApp.elements.manufacturer.emit("change");
assert.ok(unavailableApp.elements["shoe-name"].options.some((option) => option.value === "Pegasus 41"));
assert.equal(unavailableApp.warnings.length, 1);

let finishCatalog;
const gate = new Promise((resolve) => { finishCatalog = resolve; });
const editingApp = await startApp([], true, [], { catalog: names, catalogGate: gate });
assert.ok(!editingApp.elements.manufacturer.options.some((option) => option.value === "NIKE"));
editingApp.elements.manufacturer.value = "__custom__";
await editingApp.elements.manufacturer.emit("change");
editingApp.elements["custom-manufacturer"].value = "Typing Brand";
await editingApp.elements["custom-manufacturer"].emit("input");
editingApp.elements["shoe-name"].value = "__custom__";
await editingApp.elements["shoe-name"].emit("change");
editingApp.elements["custom-shoe-name"].value = "Typing Model";
finishCatalog();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(editingApp.elements["custom-manufacturer"].value, "Typing Brand");
assert.equal(editingApp.elements["custom-shoe-name"].value, "Typing Model");
assert.equal(editingApp.elements["shoe-name"].value, "__custom__");
assert.equal(editingApp.elements["custom-shoe-name"].required, true);
console.log("PASS: cross-browser names before statistics, deduplication, catalog pagination, offline fallback and preserving in-progress entries");

const seededApp = await startApp([], true, []);
assert.ok(seededApp.elements.manufacturer.options.some((option) => option.value === "NIKE"));
seededApp.elements.manufacturer.value = "NIKE";
await seededApp.elements.manufacturer.emit("change");
assert.ok(seededApp.elements["shoe-name"].options.some((option) => option.value === "Vaporfly 3"));
const emptyOfflineApp = await startApp([], false);
assert.equal(emptyOfflineApp.elements.manufacturer.options.length, 2);
assert.equal(emptyOfflineApp.elements.manufacturer.options[1].value, "__custom__");
assert.equal(emptyOfflineApp.elements["shoe-name"].disabled, true);
console.log("PASS: seeded choices come exclusively from the API; empty/offline browser supports manual input without YAML");

const aliasApp = await startApp([], true);
const a = aliasApp.elements;
a.manufacturer.value = "__custom__";
await a.manufacturer.emit("change");
a["custom-manufacturer"].value = "ＮＩＫＥ";
await a["custom-manufacturer"].emit("input");
a["shoe-name"].value = "__custom__";
await a["shoe-name"].emit("change");
a["custom-shoe-name"].value = "ぺが";
await a["custom-shoe-name"].emit("input");
assert.equal(a["model-name-suggestions"].hidden, false);
assert.equal(a["model-name-suggestions"].children[0].textContent, "Pegasus 41");
await a["model-name-suggestions"].children[0].emit("click");
assert.equal(a["custom-shoe-name"].value, "Pegasus 41");
assert.equal(a["custom-manufacturer"].value, "NIKE");
a["custom-shoe-name"].value = "ぺがさす４１";
await a["custom-shoe-name"].emit("blur");
assert.equal(a["custom-shoe-name"].value, "Pegasus 41");
a.distance.value = "650";
await a["record-form"].emit("submit");
assert.equal(aliasApp.sent[0].manufacturer, "NIKE");
assert.equal(aliasApp.sent[0].modelName, "Pegasus 41");

// The backend may know newer canonical names than this browser's catalog.
const canonicalApp = await startApp([], true, [], { catalog: [], canonicalResponse: {
  manufacturer: "NIKE", modelName: "Pegasus 41", shoeName: "NIKE Pegasus 41"
} });
const c = canonicalApp.elements;
c.manufacturer.value = "__custom__";
await c.manufacturer.emit("change");
c["custom-manufacturer"].value = "ナイキ";
await c["custom-manufacturer"].emit("input");
c["shoe-name"].value = "__custom__";
await c["shoe-name"].emit("change");
c["custom-shoe-name"].value = "ペガサス41";
c.distance.value = "650";
await c["record-form"].emit("submit");
const canonicalRecord = JSON.parse(canonicalApp.storage.get("shoeLifespanRecordsV2"))[0];
assert.equal(canonicalRecord.modelName, "Pegasus 41");
assert.equal(canonicalRecord.shoeName, "NIKE Pegasus 41");
console.log("PASS: live kana suggestions, picking a suggestion, blur canonicalization, canonical submission and server-name synchronization");

const rankedStats = [
  ["BROOKS Ghost 17", 1], ["NIKE Vomero 18", 2], ["New Balance FuelCell Rebel v5", 10],
  ["HOKA Clifton 10", 15], ["adidas ADIZERO EVO SL", 20], ["ASICS NOVABLAST 5", 25], ["NIKE Pegasus 41", 30]
].map(([shoe_name, sample_count]) => ({ shoe_name, sample_count, average_km: 600, median_km: 600,
  trimmed_average_km: 590, minimum_km: 400, maximum_km: 800 }));
const rankedApp = await startApp([], true, rankedStats, { statsPageSize: 3 });
const ranked = rankedApp.elements;
const resultModels = () => ranked["community-stats-body"].children.map((row) => row.children[1]?.textContent);
assert.equal(ranked["community-stats-body"].children.length, 5);
assert.deepEqual(resultModels(), ["Pegasus 41", "NOVABLAST 5", "ADIZERO EVO SL", "Clifton 10", "FuelCell Rebel v5"]);
assert.equal(ranked["community-search-controls"].hidden, true);
assert.equal(ranked["community-tab-top"].getAttribute("aria-selected"), "true");
assert.ok(ranked["community-status"].textContent.includes("全7種類"));
assert.ok(rankedApp.requests.some((url) => url.includes("shoe_lifespan_stats") && url.includes("offset=3")));
await ranked["community-tab-search"].emit("click");
assert.equal(ranked["community-search-controls"].hidden, false);
assert.equal(ranked["community-stats-panel"].getAttribute("aria-labelledby"), "community-tab-search");
assert.equal(ranked["community-stats-body"].children[0].children[0].textContent, "メーカー名またはシューズ名を入力してください。");
ranked["community-search"].value = "ナイキ";
await ranked["community-search"].emit("input");
assert.deepEqual(resultModels(), ["Pegasus 41", "Vomero 18"]);
ranked["community-search"].value = "ｎｉｋｅ　ペガサス";
await ranked["community-search"].emit("input");
assert.deepEqual(resultModels(), ["Pegasus 41"]);
ranked["community-search"].value = "ボメロ";
await ranked["community-search"].emit("input");
assert.deepEqual(resultModels(), ["Vomero 18"]);
await ranked["community-tab-top"].emit("click");
assert.equal(ranked["community-stats-body"].children.length, 5);
assert.equal(ranked["community-search-controls"].hidden, true);
await ranked["community-tab-top"].emit("keydown", { key: "ArrowRight" });
assert.equal(ranked["community-tab-search"].getAttribute("aria-selected"), "true");
assert.equal(ranked["community-tab-search"].tabIndex, 0);
assert.equal(ranked["community-tab-search"].focused, true);
assert.equal(ranked["community-search"].value, "ボメロ");
assert.deepEqual(resultModels(), ["Vomero 18"]);
await ranked["community-tab-search"].emit("keydown", { key: "Home" });
assert.equal(ranked["community-tab-top"].getAttribute("aria-selected"), "true");
await ranked["community-tab-top"].emit("keydown", { key: "End" });
assert.equal(ranked["community-tab-search"].getAttribute("aria-selected"), "true");
ranked["community-search"].value = "見つからないシューズ";
await ranked["community-search"].emit("input");
assert.equal(ranked["community-stats-body"].children[0].children[0].textContent, "一致するシューズはありません。");
assert.equal(ranked["community-status"].textContent, "0種類が見つかりました。");
ranked["community-search"].value = "";
await ranked["community-search"].emit("input");
assert.equal(ranked["community-stats-body"].children[0].children[0].textContent, "メーカー名またはシューズ名を入力してください。");

const allStats = Array.from({ length: 1001 }, (_, i) => ({ ...rankedStats[0], shoe_name: `Large Brand Model ${i}`, sample_count: i + 1 }));
const allStatsApp = await startApp([], true, allStats);
assert.equal(allStatsApp.elements["community-stats-body"].children[0].children[1].textContent, "Large Brand Model 1000");
assert.ok(allStatsApp.requests.some((url) => url.includes("shoe_lifespan_stats") && url.includes("offset=1000")));
await allStatsApp.elements["community-tab-search"].emit("click");
allStatsApp.elements["community-search"].value = "Model 1000";
await allStatsApp.elements["community-search"].emit("input");
assert.equal(allStatsApp.elements["community-stats-body"].children.length, 1);
assert.equal(allStatsApp.elements["community-stats-body"].children[0].children[1].textContent, "Large Brand Model 1000");

const statsErrorApp = await startApp([], true, [], { statsFailure: true });
await statsErrorApp.elements["community-tab-search"].emit("click");
statsErrorApp.elements["community-search"].value = "NIKE";
await statsErrorApp.elements["community-search"].emit("input");
assert.ok(statsErrorApp.elements["community-status"].textContent.includes("統計を取得できませんでした"));
console.log("PASS: top five by registration count, all-model search, Japanese aliases, preserved query, keyboard tabs, >1000 statistics, smaller server page caps, empty results and API failure");

const pairsApp = await startApp([], true);
const pairs = pairsApp.elements;
for (const [pairLabel, distance] of [["青", "600"], [" 白 ", "800"]]) {
  pairs.manufacturer.value = "NIKE";
  await pairs.manufacturer.emit("change");
  pairs["shoe-name"].value = "Pegasus 41";
  pairs["pair-label"].value = pairLabel;
  pairs.distance.value = distance;
  await pairs["record-form"].emit("submit");
  assert.equal(pairs["pair-label"].value, "");
}
let savedPairs = JSON.parse(pairsApp.storage.get("shoeLifespanRecordsV2"));
assert.deepEqual(savedPairs.map((record) => record.pairLabel), ["白", "青"]);
assert.notEqual(savedPairs[0].id, savedPairs[1].id);
assert.equal(pairsApp.sent.length, 2);
assert.notEqual(pairsApp.sent[0].requestId, pairsApp.sent[1].requestId);
for (const sent of pairsApp.sent) {
  assert.equal(sent.shoeName, "NIKE Pegasus 41");
  assert.equal(Object.hasOwn(sent, "pairLabel"), false);
}
assert.equal(pairs["records-body"].children[0].children[3].children[0].value, "白");
assert.equal(pairs["records-body"].children[1].children[3].children[0].value, "青");
assert.equal(pairs["personal-stats-body"].children.length, 1);
assert.equal(pairs["personal-stats-body"].children[0].children[2].textContent, "2");
assert.equal(pairs["personal-stats-body"].children[0].children[3].textContent, "700.0 km");

const blueLabel = pairs["records-body"].children[1].children[3].children[0];
blueLabel.value = "  練習用（青）  ";
await blueLabel.emit("input");
await blueLabel.emit("change");
savedPairs = JSON.parse(pairsApp.storage.get("shoeLifespanRecordsV2"));
assert.equal(savedPairs[1].pairLabel, "練習用(青)");
assert.equal(savedPairs[1].id, pairsApp.sent[0].requestId);
assert.equal(savedPairs[1].shareStatus, "shared");
assert.equal(pairsApp.sent.length, 2);

const reloadedPairs = await startApp(savedPairs, true);
assert.equal(reloadedPairs.elements["records-body"].children[1].children[3].children[0].value, "練習用(青)");
assert.equal(reloadedPairs.sent.length, 0);
await reloadedPairs.elements["records-body"].children[0].children[5].children[0].emit("click");
const remainingPairs = JSON.parse(reloadedPairs.storage.get("shoeLifespanRecordsV2"));
assert.equal(remainingPairs.length, 1);
assert.equal(remainingPairs[0].pairLabel, "練習用(青)");
assert.equal(remainingPairs[0].distance, 600);

const legacyLabelApp = await startApp([legacy], true);
const legacyLabel = legacyLabelApp.elements["records-body"].children[0].children[3].children[0];
assert.equal(legacyLabel.value, "");
legacyLabel.value = "1足目";
await legacyLabel.emit("input");
const renamedLegacy = JSON.parse(legacyLabelApp.storage.get("shoeLifespanRecordsV2"))[0];
assert.equal(renamedLegacy.pairLabel, "1足目");
assert.equal(renamedLegacy.id, legacy.id);
assert.equal(renamedLegacy.shoeName, legacy.shoeName);
assert.equal(renamedLegacy.shareStatus, "private");
assert.equal(legacyLabelApp.sent.length, 0);

pairs.manufacturer.value = "NIKE";
await pairs.manufacturer.emit("change");
pairs["shoe-name"].value = "Pegasus 41";
pairs.distance.value = "650";
pairs["pair-label"].value = "あ".repeat(41);
await pairs["record-form"].emit("submit");
assert.equal(pairsApp.sent.length, 2);
assert.equal(JSON.parse(pairsApp.storage.get("shoeLifespanRecordsV2")).length, 2);
assert.equal(pairs["form-status"].textContent, "識別名は40文字以内で入力してください。");

const labelledRetryApp = await startApp([{ ...legacy, pairLabel: "白", shareStatus: "failed" }], true);
await labelledRetryApp.elements["records-body"].children[0].children[4].children[0].children[0].emit("click");
assert.equal(labelledRetryApp.sent[0].requestId, legacy.id);
assert.equal(Object.hasOwn(labelledRetryApp.sent[0], "pairLabel"), false);
assert.equal(JSON.parse(labelledRetryApp.storage.get("shoeLifespanRecordsV2"))[0].pairLabel, "白");
console.log("PASS: separate pairs of one model, optional local labels, inline autosave, reload, individual deletion, unchanged aggregates, private labels, legacy editing, length validation and retry persistence");

const editableRecord = { ...legacy, shareStatus: "shared", pairLabel: "1足目", createdAt: "2026-11-01T00:00:00.000Z" };
const editApp = await startApp([editableRecord], true);
const edit = editApp.elements;
await edit["records-body"].children[0].children[5].children[1].emit("click");
assert.equal(edit["record-heading"].textContent, "シューズの記録を編集");
assert.equal(edit["cancel-edit"].hidden, false);
assert.equal(edit.manufacturer.value, "NIKE");
assert.equal(edit["shoe-name"].value, "Pegasus 41");
assert.equal(edit.distance.value, "500");
assert.equal(edit["pair-label"].value, "1足目");
edit.distance.value = "700";
await edit["record-form"].emit("submit");
let edited = JSON.parse(editApp.storage.get("shoeLifespanRecordsV2"));
assert.equal(edited.length, 1);
assert.equal(edited[0].id, editableRecord.id);
assert.equal(edited[0].createdAt, editableRecord.createdAt);
assert.equal(edited[0].distance, 700);
assert.equal(edited[0].pendingUpdate, false);
assert.equal(editApp.sent[0].action, "save");
assert.equal(editApp.sent[0].requestId, editableRecord.id);
assert.equal(editApp.sent[0].shoeName, editableRecord.shoeName);
assert.equal(editApp.sent[0].manufacturer, undefined);
assert.equal(edit["cancel-edit"].hidden, true);
assert.equal(edit["personal-stats-body"].children[0].children[3].textContent, "700.0 km");

await edit["records-body"].children[0].children[5].children[1].emit("click");
edit.manufacturer.value = "adidas";
await edit.manufacturer.emit("change");
edit["shoe-name"].value = "ADIZERO EVO SL";
edit.distance.value = "900";
edit["pair-label"].value = "白";
await edit["record-form"].emit("submit");
edited = JSON.parse(editApp.storage.get("shoeLifespanRecordsV2"));
assert.equal(edited.length, 1);
assert.equal(edited[0].id, editableRecord.id);
assert.equal(edited[0].shoeName, "adidas ADIZERO EVO SL");
assert.equal(editApp.sent[1].manufacturer, "adidas");
assert.equal(editApp.sent[1].modelName, "ADIZERO EVO SL");
assert.equal(editApp.sent[1].action, "save");
assert.equal(editApp.sent[1].requestId, editableRecord.id);
assert.equal(Object.hasOwn(editApp.sent[1], "pairLabel"), false);
assert.equal(edit["personal-stats-body"].children[0].children[0].textContent, "adidas");

await edit["records-body"].children[0].children[5].children[1].emit("click");
edit.distance.value = "950";
await edit["cancel-edit"].emit("click");
assert.equal(JSON.parse(editApp.storage.get("shoeLifespanRecordsV2"))[0].distance, 900);
assert.equal(editApp.sent.length, 2);
await edit["records-body"].children[0].children[5].children[1].emit("click");
edit["pair-label"].value = "レース用";
await edit["record-form"].emit("submit");
assert.equal(JSON.parse(editApp.storage.get("shoeLifespanRecordsV2"))[0].pairLabel, "レース用");
assert.equal(editApp.sent.length, 2);

const editFailedApp = await startApp([editableRecord], true, [], { submitFailure: true });
await editFailedApp.elements["records-body"].children[0].children[5].children[1].emit("click");
editFailedApp.elements.distance.value = "850";
await editFailedApp.elements["record-form"].emit("submit");
const pending = JSON.parse(editFailedApp.storage.get("shoeLifespanRecordsV2"));
assert.equal(pending.length, 1);
assert.equal(pending[0].id, editableRecord.id);
assert.equal(pending[0].distance, 850);
assert.equal(pending[0].shareStatus, "failed");
assert.equal(pending[0].pendingUpdate, true);
const resumedEdit = await startApp(pending, true);
await resumedEdit.elements["records-body"].children[0].children[4].children[0].children[0].emit("click");
assert.equal(resumedEdit.sent[0].action, "save");
assert.equal(resumedEdit.sent[0].requestId, editableRecord.id);
assert.equal(resumedEdit.sent[0].distanceKm, 850);
assert.equal(JSON.parse(resumedEdit.storage.get("shoeLifespanRecordsV2"))[0].shareStatus, "shared");
assert.equal(JSON.parse(resumedEdit.storage.get("shoeLifespanRecordsV2"))[0].pendingUpdate, false);

const unknownEditApp = await startApp([{ ...legacy, shoeName: "旧シューズ" }], true);
await unknownEditApp.elements["records-body"].children[0].children[5].children[1].emit("click");
assert.equal(unknownEditApp.elements.manufacturer.value, "__legacy__");
assert.equal(unknownEditApp.elements["shoe-name"].value, "旧シューズ");
unknownEditApp.elements.distance.value = "800";
await unknownEditApp.elements["record-form"].emit("submit");
const savedUnknown = JSON.parse(unknownEditApp.storage.get("shoeLifespanRecordsV2"))[0];
assert.equal(savedUnknown.shoeName, "旧シューズ");
assert.equal(savedUnknown.distance, 800);
assert.equal(savedUnknown.shareStatus, "private");
assert.equal(unknownEditApp.sent.length, 0);

await edit["records-body"].children[0].children[5].children[1].emit("click");
edit.distance.value = "3";
await edit["record-form"].emit("submit");
assert.equal(edit["cancel-edit"].hidden, false);
assert.equal(JSON.parse(editApp.storage.get("shoeLifespanRecordsV2"))[0].distance, 900);
assert.equal(editApp.sent.length, 2);
await edit["records-body"].children[0].children[5].children[0].emit("click");
assert.equal(edit["cancel-edit"].hidden, true);
assert.equal(edit["submit-record"].textContent, "記録を追加");
console.log("PASS: edit/save/cancel, stable record IDs, model changes, label-only edits without network, pending edits and retry after reload, legacy records, private-record privacy, validation and deleting an edited record");
