// Shared by the browser and Edge Function. This contains spelling aliases,
// not model choices: the authoritative list of models lives in Supabase.
export const MANUFACTURERS = [
  { name: "NIKE", aliases: ["ナイキ"] },
  { name: "adidas", aliases: ["アディダス"] },
  { name: "ASICS", aliases: ["アシックス"] },
  { name: "New Balance", aliases: ["NB", "ニューバランス"] },
  { name: "PUMA", aliases: ["プーマ"] },
  { name: "BROOKS", aliases: ["ブルックス"] },
  { name: "HOKA", aliases: ["ホカ", "ホカオネオネ", "HOKA ONE ONE"] },
  { name: "Saucony", aliases: ["サッカニー", "サウコニー"] },
  { name: "MIZUNO", aliases: ["ミズノ", "美津濃"] },
  { name: "On", aliases: ["オン"] },
  { name: "ALTRA", aliases: ["アルトラ"] },
  { name: "Salomon", aliases: ["サロモン"] }
];

const TOKENS = {
  NIKE: { "ペガサス": "pegasus", "ヴェイパーフライ": "vaporfly", "ベイパーフライ": "vaporfly", "アルファフライ": "alphafly", "ボメロ": "vomero", "ズームフライ": "zoomfly", "プレミアム": "premium" },
  adidas: { "アディゼロ": "adizero", "アディオス": "adios", "ボストン": "boston", "タクミセン": "takumisen", "ジャパン": "japan", "エヴォ": "evo", "エボ": "evo", "プロ": "pro" },
  ASICS: { "ゲル": "gel", "ニンバス": "nimbus", "カヤノ": "kayano", "キュムラス": "cumulus", "ノヴァブラスト": "novablast", "ノバブラスト": "novablast", "スーパーブラスト": "superblast", "マジックスピード": "magicspeed", "メタスピード": "metaspeed", "スカイ": "sky", "エッジ": "edge", "トウキョウ": "tokyo", "トーキョー": "tokyo", "東京": "tokyo", "レイ": "ray" },
  "New Balance": { "フューエルセル": "fuelcell", "スーパーコンプ": "supercomp", "エリート": "elite", "レベル": "rebel", "フレッシュフォームエックス": "freshfoamx", "フレッシュフォーム": "freshfoam" },
  PUMA: { "ディヴィエイト": "deviate", "ディビエイト": "deviate", "デヴィエイト": "deviate", "デビエイト": "deviate", "ニトロ": "nitro", "エリート": "elite", "ヴェロシティ": "velocity", "ベロシティ": "velocity", "マグニファイ": "magnify", "ファストアール": "fastr" },
  BROOKS: { "ハイペリオン": "hyperion", "ゴースト": "ghost", "グリセリン": "glycerin", "マックス": "max" },
  HOKA: { "クリフトン": "clifton", "ボンダイ": "bondi", "マッハ": "mach", "ロケット": "rocket", "エックス": "x" },
  Saucony: { "エンドルフィン": "endorphin", "スピード": "speed", "プロ": "pro", "ライド": "ride", "トライアンフ": "triumph" },
  MIZUNO: { "ウエーブ": "wave", "ウェーブ": "wave", "ライダー": "rider", "ネオ": "neo", "ビスタ": "vista", "ヴィスタ": "vista", "ゼン": "zen", "リベリオン": "rebellion", "プロ": "pro" },
  On: { "クラウドモンスター": "cloudmonster", "クラウドサーファー": "cloudsurfer", "クラウドブーム": "cloudboom", "クラウドランナー": "cloudrunner", "ストライク": "strike" },
  ALTRA: { "トーリン": "torin", "トリン": "torin", "エスカランテ": "escalante", "エクスペリエンス": "experience", "フロー": "flow" },
  Salomon: { "エアログライド": "aeroglide", "エアロブレイズ": "aeroblaze", "エスラボ": "slab", "ファンタズム": "phantasm" }
};

export function cleanName(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function nameKey(value) {
  return cleanName(value).toLocaleLowerCase("ja")
    .replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
    .replace(/[\s\-_.・･/\\'"()（）%％+＋™®]+/g, "");
}

export function normalizeManufacturer(value, catalog = []) {
  const name = cleanName(value);
  const key = nameKey(name);
  const standard = MANUFACTURERS.find((brand) => [brand.name, ...brand.aliases].some((alias) => nameKey(alias) === key));
  if (standard) return standard.name;
  const known = catalog.find((shoe) => nameKey(shoe.manufacturer) === key);
  return known ? known.manufacturer : name;
}

export function stripManufacturer(value, manufacturer) {
  const name = cleanName(value);
  const brand = MANUFACTURERS.find((item) => item.name === normalizeManufacturer(manufacturer));
  const aliases = [manufacturer, ...(brand ? [brand.name, ...brand.aliases] : [])]
    .map(cleanName).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (!name.toLocaleLowerCase("ja").startsWith(alias.toLocaleLowerCase("ja"))) continue;
    const rest = name.slice(alias.length);
    // Latin brands need a word boundary: "On" must not strip "Onward".
    if (rest && (/^[\s:：・/\\-]/.test(rest) || /[^\x00-\x7f]/.test(alias))) {
      return rest.replace(/^[\s:：・/\\-]+/, "").trim();
    }
  }
  return name;
}

export function modelKey(value, manufacturer) {
  const brand = normalizeManufacturer(manufacturer);
  let key = nameKey(stripManufacturer(value, brand));
  const tokens = Object.entries(TOKENS[brand] || {}).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, spelling] of tokens) key = key.replaceAll(nameKey(alias), spelling);
  if (brand === "adidas") key = key.replace(/^adizero/, "");
  if (brand === "New Balance") key = key.replace(/^(fuelcell|freshfoamx?)/, "").replace(/^sc/, "supercomp");
  // v5 and 5 are spelling variants; the number itself always remains.
  return key.replace(/v(?=\d)/g, "");
}

export function resolveShoe(manufacturer, modelName, catalog = []) {
  const brand = normalizeManufacturer(manufacturer, catalog);
  const model = stripManufacturer(modelName, brand);
  const choices = catalog.filter((shoe) => nameKey(normalizeManufacturer(shoe.manufacturer)) === nameKey(brand) && shoe.modelName);
  const exact = choices.filter((shoe) => nameKey(shoe.modelName) === nameKey(model));
  const matches = exact.length === 1 ? exact : choices.filter((shoe) => modelKey(shoe.modelName, brand) === modelKey(model, brand));
  // Ambiguous names and misspellings are suggestions, never silent merges.
  const unique = new Map();
  for (const shoe of matches) {
    const key = nameKey(shoe.modelName);
    if (!unique.has(key)) unique.set(key, shoe);
  }
  if (unique.size === 1) {
    const match = [...unique.values()][0];
    return { manufacturer: normalizeManufacturer(match.manufacturer, catalog), modelName: cleanName(match.modelName), matched: true };
  }
  return { manufacturer: brand, modelName: model, matched: false };
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

export function suggestShoes(manufacturer, query, catalog = [], limit = 5) {
  const brand = normalizeManufacturer(manufacturer, catalog);
  const key = modelKey(query, brand);
  if (!key) return [];
  const queryKeys = new Set([key]);
  // An unfinished kana token (e.g. "ぺが") must predict English catalog names
  // before the user has finished typing the complete spelling alias.
  const unfinished = key.match(/([ァ-ヺー一-龯]+)(\d*)$/);
  if (unfinished) {
    for (const [alias, spelling] of Object.entries(TOKENS[brand] || {})) {
      if (nameKey(alias).startsWith(unfinished[1])) {
        queryKeys.add(key.slice(0, unfinished.index) + spelling + unfinished[2]);
      }
    }
  }
  const digits = key.match(/\d+/g)?.join(",") || "";
  const matches = new Map();
  for (const shoe of catalog) {
    if (nameKey(normalizeManufacturer(shoe.manufacturer)) !== nameKey(brand) || !shoe.modelName) continue;
    const candidate = modelKey(shoe.modelName, brand);
    let score = Infinity;
    for (const queryKey of queryKeys) {
      if (candidate === queryKey) score = Math.min(score, 0);
      else if (candidate.startsWith(queryKey)) score = Math.min(score, 1 + (candidate.length - queryKey.length) / 100);
      else if (!digits || digits === (candidate.match(/\d+/g)?.join(",") || "")) {
        if (candidate.includes(queryKey)) score = Math.min(score, 2);
        else if (queryKey.length >= 4) {
          const distance = editDistance(queryKey, candidate);
          if (distance <= Math.max(1, Math.floor(candidate.length * 0.2))) score = Math.min(score, 3 + distance);
        }
      }
    }
    if (Number.isFinite(score)) {
      const identity = nameKey(shoe.modelName);
      if (!matches.has(identity) || matches.get(identity).score > score) matches.set(identity, { ...shoe, score });
    }
  }
  return [...matches.values()].sort((a, b) => a.score - b.score || a.modelName.localeCompare(b.modelName, "ja")).slice(0, limit);
}
