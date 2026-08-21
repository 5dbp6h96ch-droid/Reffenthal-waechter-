import * as webpush from "@negrel/webpush";

interface Env {
  DB: D1Database;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_JWK: string;
  PUSH_TEST_SECRET: string;
  ASSETS?: Fetcher;
}

type PushSubscriptionPayload = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

type SubscribeBody = {
  subscription?: PushSubscriptionPayload;
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  gauge_id?: string;
  threshold_cm?: number | null;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function deviceId(request: Request): string | null {
  const value = request.headers.get("x-rheinschiffer-device-id")?.trim();
  return value || null;
}

function normalizeSubscription(body: SubscribeBody) {
  const sub = body.subscription ?? body;
  const endpoint = sub.endpoint?.trim();
  const p256dh = sub.keys?.p256dh?.trim();
  const auth = sub.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

async function upsertSubscription(request: Request, env: Env): Promise<Response> {
  const id = deviceId(request);
  if (!id) return json({ error: "Missing device id" }, 400);

  let body: SubscribeBody;
  try {
    body = await request.json<SubscribeBody>();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const subscription = normalizeSubscription(body);
  if (!subscription) return json({ error: "Invalid push subscription" }, 400);

  const gaugeId = (body.gauge_id || "SPEYER").trim().toUpperCase();
  const threshold = Number.isFinite(body.threshold_cm) ? Math.round(body.threshold_cm as number) : null;

  await env.DB.prepare(
    `INSERT INTO device_preferences (device_id, gauge_id, threshold_cm, updated_at)
     VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id) DO UPDATE SET
       gauge_id = excluded.gauge_id,
       threshold_cm = excluded.threshold_cm,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(id, gaugeId, threshold).run();

  await env.DB.prepare(
    `INSERT INTO push_subscriptions
       (device_id, endpoint, p256dh, auth, gauge_id, threshold_cm, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(endpoint) DO UPDATE SET
       device_id = excluded.device_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       gauge_id = excluded.gauge_id,
       threshold_cm = excluded.threshold_cm,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(id, subscription.endpoint, subscription.p256dh, subscription.auth, gaugeId, threshold).run();

  return json({ ok: true, push_enabled: true });
}

async function unsubscribe(request: Request, env: Env): Promise<Response> {
  const id = deviceId(request);
  if (!id) return json({ error: "Missing device id" }, 400);

  let endpoint: string | undefined;
  try {
    const body = await request.json<{ endpoint?: string; subscription?: { endpoint?: string } }>();
    endpoint = body.endpoint ?? body.subscription?.endpoint;
  } catch {
    // Device-wide unsubscribe is intentionally supported if the body is empty.
  }

  if (endpoint) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE device_id = ?1 AND endpoint = ?2")
      .bind(id, endpoint).run();
  } else {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE device_id = ?1").bind(id).run();
  }

  return json({ ok: true, push_enabled: false });
}

async function getSources(request: Request, env: Env): Promise<Response> {
  const id = deviceId(request);
  if (!id) return json({ error: "Missing device id" }, 400);
  const row = await env.DB.prepare(
    "SELECT source_tankstellen, source_nfb FROM device_preferences WHERE device_id = ?1",
  ).bind(id).first<{ source_tankstellen: number; source_nfb: number }>();
  return json({
    tankstellen: row ? Boolean(row.source_tankstellen) : true,
    nfb: row ? Boolean(row.source_nfb) : true,
  });
}

async function saveSources(request: Request, env: Env): Promise<Response> {
  const id = deviceId(request);
  if (!id) return json({ error: "Missing device id" }, 400);
  const body = await request.json<{ tankstellen?: boolean; nfb?: boolean }>();
  await env.DB.prepare(
    `INSERT INTO device_preferences (device_id, source_tankstellen, source_nfb, updated_at)
     VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id) DO UPDATE SET
       source_tankstellen = excluded.source_tankstellen,
       source_nfb = excluded.source_nfb,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(id, body.tankstellen === false ? 0 : 1, body.nfb === false ? 0 : 1).run();
  return json({ ok: true });
}

async function sendTestPush(request: Request, env: Env): Promise<Response> {
  const suppliedSecret = request.headers.get("x-rheinschiffer-push-test-secret");
  if (!env.PUSH_TEST_SECRET || suppliedSecret !== env.PUSH_TEST_SECRET) {
    return json({ error: "Forbidden" }, 403);
  }

  const id = deviceId(request);
  if (!id) return json({ error: "Missing device id" }, 400);

  const subscription = await env.DB.prepare(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE device_id = ?1
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(id).first<{ id: number; endpoint: string; p256dh: string; auth: string }>();

  if (!subscription) return json({ error: "No active push subscription" }, 404);

  let privateJwk: JsonWebKey;
  try {
    privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey;
  } catch {
    return json({ error: "Invalid VAPID private key configuration" }, 500);
  }

  const publicJwk: JsonWebKey = {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    y: privateJwk.y,
    ext: true,
  };

  const vapidKeys = await webpush.importVapidKeys({ privateKey: privateJwk, publicKey: publicJwk });
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: "mailto:push@rheinschiffer.de",
    vapidKeys,
  });
  const subscriber = appServer.subscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  });

  const payload = JSON.stringify({
    title: "R(h)einschiffer Test",
    body: "Push-Test aus der parallelen Testumgebung",
    url: "/#/einstellungen",
    notification: {
      title: "R(h)einschiffer Test",
      body: "Push-Test aus der parallelen Testumgebung",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      navigate: "/#/einstellungen",
    },
  });

  try {
    await subscriber.pushTextMessage(payload, { ttl: 300, urgency: "high" });
    return json({ ok: true, sent: 1 });
  } catch (error) {
    if (error instanceof webpush.PushMessageError && error.isGone()) {
      await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?1").bind(subscription.id).run();
    }
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: "Push send failed", detail: message }, 502);
  }
}

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/health" && request.method === "GET") {
    return json({ ok: true, system: "rheinschiffer-worker-rebuild" });
  }
  if (path === "/api/push/vapid-public-key" && request.method === "GET") {
    return json({ configured: Boolean(env.VAPID_PUBLIC_KEY), publicKey: env.VAPID_PUBLIC_KEY || null });
  }
  if (path === "/api/push/subscribe" && request.method === "POST") return upsertSubscription(request, env);
  if (path === "/api/push/unsubscribe" && request.method === "POST") return unsubscribe(request, env);
  if (path === "/api/push/test" && request.method === "POST") return sendTestPush(request, env);
  if (path === "/api/preferences/sources" && request.method === "GET") return getSources(request, env);
  if (path === "/api/preferences/sources" && request.method === "POST") return saveSources(request, env);

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("R(h)einschiffer parallel test worker", { status: 200 });
  },
};
