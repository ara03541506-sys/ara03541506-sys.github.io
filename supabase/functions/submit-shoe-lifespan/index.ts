import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveShoe } from "../../../assets/js/shoe-names.mjs";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const publishableKey = Deno.env.get("SHOE_STATS_PUBLISHABLE_KEY") ?? "";
const supabaseSecretKey =
  Deno.env.get("SHOE_STATS_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ??
    "https://ara03541506-sys.github.io,http://localhost:4000,http://127.0.0.1:4000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

type SubmissionBody = {
  action?: unknown;
  requestId?: unknown;
  clientId?: unknown;
  shoeName?: unknown;
  manufacturer?: unknown;
  modelName?: unknown;
  distanceKm?: unknown;
  consent?: unknown;
};

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function canonicalizeShoeName(value: unknown) {
  if (typeof value !== "string") return null;
  const canonicalName = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (canonicalName.length < 2 || canonicalName.length > 80) return null;
  if (/https?:\/\/|[<>\u0000-\u001f]/i.test(canonicalName)) return null;
  if (!/[\p{L}\p{N}]/u.test(canonicalName)) return null;

  const normalizedName = canonicalName
    .toLocaleLowerCase("ja")
    .replace(/[\s\-_.・･/\\'"()（）%％+＋]+/g, "")
    .trim();

  if (normalizedName.length < 2 || normalizedName.length > 80) return null;
  return { canonicalName, normalizedName };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    if (!origin || !allowedOrigins.has(origin)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  }
  if (!origin || !allowedOrigins.has(origin)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
  }
  if (!supabaseUrl || !supabaseSecretKey || !publishableKey) {
    console.error("Required environment variables are missing");
    return jsonResponse({ error: "server_not_configured" }, 503, origin);
  }
  // Publishable keys identify the app, not an individual user. Check them
  // here because this anonymous endpoint does not use user JWT verification.
  if (request.headers.get("apikey") !== publishableKey) {
    return jsonResponse({ error: "invalid_api_key" }, 401, origin);
  }

  let body: SubmissionBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, origin);
  }

  if (body.consent !== true) {
    return jsonResponse({ error: "consent_required" }, 400, origin);
  }
  if (!isUuid(body.requestId) || !isUuid(body.clientId)) {
    return jsonResponse({ error: "invalid_request_id" }, 400, origin);
  }
  if (body.action !== undefined && body.action !== "create" && body.action !== "save") {
    return jsonResponse({ error: "invalid_submission" }, 400, origin);
  }

  let shoe = canonicalizeShoeName(body.shoeName);
  const distanceKm = Number(body.distanceKm);
  if (!shoe || !Number.isFinite(distanceKm) || distanceKm < 10 || distanceKm > 3000) {
    return jsonResponse({ error: "invalid_submission" }, 400, origin);
  }
  let manufacturer: string | null = null;
  let modelName: string | null = null;
  if (body.manufacturer !== undefined || body.modelName !== undefined) {
    const brand = canonicalizeShoeName(body.manufacturer);
    const model = canonicalizeShoeName(body.modelName);
    if (!brand || !model || brand.canonicalName.length > 40) {
      return jsonResponse({ error: "invalid_submission" }, 400, origin);
    }
    const fullName = canonicalizeShoeName(`${brand.canonicalName} ${model.canonicalName}`);
    if (!fullName || fullName.normalizedName !== shoe.normalizedName) {
      return jsonResponse({ error: "invalid_submission" }, 400, origin);
    }
    manufacturer = brand.canonicalName;
    modelName = model.canonicalName;
  }
  const contributorHash = await sha256Hex(
    `shoe-lifespan-contributor|${body.clientId}`,
  );

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (manufacturer && modelName) {
    const catalog: { manufacturer: string; modelName: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.rpc("get_shoe_catalog").range(offset, offset + 999);
      if (error || !Array.isArray(data)) {
        console.error("Catalog lookup failed", error?.message);
        return jsonResponse({ error: "storage_error" }, 500, origin);
      }
      for (const item of data) {
        if (typeof item.manufacturer === "string" && typeof item.model_name === "string") {
          catalog.push({ manufacturer: item.manufacturer, modelName: item.model_name });
        }
      }
      if (data.length < 1000) break;
    }
    const resolved = resolveShoe(manufacturer, modelName, catalog);
    const canonical = canonicalizeShoeName(`${resolved.manufacturer} ${resolved.modelName}`);
    if (!canonical || resolved.manufacturer.length > 40) {
      return jsonResponse({ error: "invalid_submission" }, 400, origin);
    }
    manufacturer = resolved.manufacturer;
    modelName = resolved.modelName;
    shoe = canonical;
  }

  const { error: modelUpsertError } = await supabase
    .from("shoe_models")
    .upsert(
      {
        canonical_name: shoe.canonicalName,
        normalized_name: shoe.normalizedName,
        ...(manufacturer && modelName ? { manufacturer, model_name: modelName } : {}),
      },
      { onConflict: "normalized_name", ignoreDuplicates: true },
    );
  if (modelUpsertError) {
    console.error("Model upsert failed", modelUpsertError.message);
    return jsonResponse({ error: "storage_error" }, 500, origin);
  }

  const { data: model, error: modelError } = await supabase
    .from("shoe_models")
    .select("id,canonical_name")
    .eq("normalized_name", shoe.normalizedName)
    .single();
  if (modelError || !model) {
    console.error("Model lookup failed", modelError?.message);
    return jsonResponse({ error: "storage_error" }, 500, origin);
  }

  // Fill structured metadata for an already existing model without changing
  // its canonical name or ID, so prior submissions stay in the same group.
  if (manufacturer && modelName) {
    const { error: metadataError } = await supabase
      .from("shoe_models")
      .update({ manufacturer, model_name: modelName })
      .eq("id", model.id);
    if (metadataError) {
      console.error("Model metadata update failed", metadataError.message);
      return jsonResponse({ error: "storage_error" }, 500, origin);
    }
  }

  if (body.action === "save") {
    const { data: saved, error: saveError } = await supabase.rpc("save_shoe_lifespan_submission", {
      p_request_id: body.requestId,
      p_shoe_model_id: model.id,
      p_distance_km: Math.round(distanceKm * 10) / 10,
      p_contributor_hash: contributorHash,
    });
    if (saveError) {
      console.error("Submission save failed", saveError.message);
      return jsonResponse({ error: "storage_error" }, 500, origin);
    }
    if (saved !== true) {
      return jsonResponse({ error: "record_not_owned" }, 403, origin);
    }
    return jsonResponse({ ok: true, saved: true, ...(manufacturer && modelName ? {
      shoe: { manufacturer, modelName, shoeName: model.canonical_name }
    } : {}) }, 200, origin);
  }

  const { error: insertError } = await supabase
    .from("shoe_lifespan_submissions")
    .insert({
      request_id: body.requestId,
      shoe_model_id: model.id,
      distance_km: Math.round(distanceKm * 10) / 10,
      status: "accepted",
      source_hash: contributorHash,
      contributor_hash: contributorHash,
    });

  if (insertError?.code === "23505") {
    return jsonResponse({ ok: true, duplicate: true, ...(manufacturer && modelName ? {
      shoe: { manufacturer, modelName, shoeName: model.canonical_name }
    } : {}) }, 200, origin);
  }
  if (insertError) {
    console.error("Submission insert failed", insertError.message);
    return jsonResponse({ error: "storage_error" }, 500, origin);
  }

  return jsonResponse({ ok: true, ...(manufacturer && modelName ? {
    shoe: { manufacturer, modelName, shoeName: model.canonical_name }
  } : {}) }, 201, origin);
});
