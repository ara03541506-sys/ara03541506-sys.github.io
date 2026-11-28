import assert from "node:assert/strict";
import { normalizeManufacturer, resolveShoe, suggestShoes, modelKey } from "../assets/js/shoe-names.mjs";

const catalog = [
  ["NIKE", "Pegasus 41"], ["NIKE", "Vaporfly 3"], ["NIKE", "Vaporfly 4"],
  ["adidas", "ADIZERO ADIOS PRO 4"], ["adidas", "ADIZERO JAPAN 9"],
  ["New Balance", "FuelCell SuperComp Elite v5"],
  ["PUMA", "Deviate NITRO Elite 4"], ["HOKA", "Clifton 10"],
  ["ASICS", "METASPEED SKY TOKYO"], ["MIZUNO", "NEO VISTA 2"],
  ["On", "Cloudmonster 2"], ["My Brand", "Daily Runner"]
].map(([manufacturer, modelName]) => ({ manufacturer, modelName }));

for (const [inputBrand, inputModel, expectedBrand, expectedModel] of [
  ["ＮＩＫＥ", " ｐｅｇａｓｕｓ ４１ ", "NIKE", "Pegasus 41"],
  ["ナイキ", "ぺがさす４１", "NIKE", "Pegasus 41"],
  ["nike", "ナイキ ペガサス 41", "NIKE", "Pegasus 41"],
  ["アディダス", "アディオス プロ４", "adidas", "ADIZERO ADIOS PRO 4"],
  ["ＮＢ", "ＳＣ エリート ｖ５", "New Balance", "FuelCell SuperComp Elite v5"],
  ["プーマ", "デヴィエイト ニトロ エリート４", "PUMA", "Deviate NITRO Elite 4"],
  ["ホカオネオネ", "クリフトン１０", "HOKA", "Clifton 10"],
  ["アシックス", "メタスピード スカイ 東京", "ASICS", "METASPEED SKY TOKYO"],
  ["ミズノ", "ミズノ ネオビスタ２", "MIZUNO", "NEO VISTA 2"],
  ["オン", "クラウドモンスター２", "On", "Cloudmonster 2"],
  ["my brand", "daily runner", "My Brand", "Daily Runner"]
]) {
  const result = resolveShoe(inputBrand, inputModel, catalog);
  assert.equal(result.manufacturer, expectedBrand, inputBrand);
  assert.equal(result.modelName, expectedModel, inputModel);
  assert.equal(result.matched, true);
}

assert.equal(normalizeManufacturer("newbalance"), "New Balance");
assert.equal(resolveShoe("NIKE", "Vaporfly 4", catalog).modelName, "Vaporfly 4");
assert.equal(resolveShoe("NIKE", "Vaporfly 5", catalog).matched, false);
assert.equal(resolveShoe("NIKE", "Vaporfly", catalog).matched, false);
assert.equal(resolveShoe("NIKE", "Pegaus 41", catalog).matched, false);
assert.equal(suggestShoes("ナイキ", "ぺが", catalog)[0].modelName, "Pegasus 41");
assert.equal(suggestShoes("NIKE", "Pegaus 41", catalog)[0].modelName, "Pegasus 41");
assert.ok(suggestShoes("NIKE", "Vaporfly 5", catalog).every((shoe) => !/ [34]$/.test(shoe.modelName)));
assert.equal(suggestShoes("HOKA", "Pegasus 41", catalog).length, 0);
assert.notEqual(modelKey("Pegasus 41", "NIKE"), modelKey("Pegasus 42", "NIKE"));
assert.equal(resolveShoe("On", "Onward 2", []).modelName, "Onward 2");
assert.equal(resolveShoe("New Brand", "Unknown Model 2", []).modelName, "Unknown Model 2");
assert.equal(resolveShoe("NIKE", "ペガサス41", [...catalog, { manufacturer: "NIKE", modelName: "PEGASUS41" }]).modelName, "Pegasus 41");
const ambiguous = [...catalog, { manufacturer: "adidas", modelName: "ADIOS PRO 4" }];
assert.equal(resolveShoe("adidas", "アディオスプロ4", ambiguous).matched, false);
console.log("PASS: Japanese/English/width/case/brand aliases, exact canonicalization, typo suggestions, generation isolation, ambiguity and unknown model preservation");
