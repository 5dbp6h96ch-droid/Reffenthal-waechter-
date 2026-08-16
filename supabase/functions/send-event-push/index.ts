import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

// Source of truth: deployed TEST Supabase Edge Function send-event-push.
// The function accepts only a Supabase server secret/service-role credential
// in the apikey/Authorization header; never expose that credential to clients.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EventType = "gauge_change" | "threshold_crossed" | "wsv_news" | "test";

interface EventPayload {
  event_type: EventType;
  title: string;
  body: string;
  url?: string;
  gauge_id?: string;
  current_cm?: number;
  previous_cm?: number;
  threshold_cm?: number;
  timestamp?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request): boolean {
  const supplied = req.headers.get("apikey") ??
    (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  if (!supplied) return false;

  const candidates: string[] = [];
  try {
    const secretMap = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    for (const value of Object.values(secretMap)) {
      if (typeof value === "string") candidates.push(value);
      else if (value && typeof value === "object" && "key" in value && typeof value.key === "string") {
        candidates.push(value.key);
      }
    }
  } catch {
    // Ignore malformed optional secret map and try the legacy key below.
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) candidates.push(legacy);
  return candidates.some((candidate) => candidate === supplied);
}

function formatThresholdBody(payload: EventPayload): string {
  const current = payload.current_cm != null ? `${payload.current_cm} cm` : "—";
  const threshold = payload.threshold_cm != null ? `${payload.threshold_cm} cm` : "—";
  const stand = payload.timestamp
    ? new Date(payload.timestamp).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
  return `Aktuell: ${current}\nUnter Schwelle: ${threshold}\nStand: ${stand}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const payload = await req.json() as EventPayload;
    if (!payload.event_type || !payload.title || !payload.body) {
      return json({ error: "event_type, title and body are required" }, 400);
    }

    if (payload.event_type === "threshold_crossed" && !payload.gauge_id) {
      return json({ error: "gauge_id is required for threshold_crossed" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"))[0];
    if (!secretKey || typeof secretKey !== "string") throw new Error("No server key configured");

    const admin = createClient(supabaseUrl, secretKey);

    const { data: config, error: configError } = await admin
      .from("web_push_vapid_config")
      .select("public_key, private_key_jwk")
      .eq("id", true)
      .single();
    if (configError || !config) throw new Error("VAPID-Konfiguration fehlt.");

    const { data: subscriptions, error: subError } = await admin
      .from("web_push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth");
    if (subError) throw subError;

    let targets = subscriptions ?? [];
    let notificationBody = payload.body;

    if (payload.event_type === "threshold_crossed") {
      const userIds = [...new Set((subscriptions ?? []).map((sub) => sub.user_id))];

      const { data: userSettings, error: userSettingsError } = await admin
        .from("user_settings")
        .select("user_id, selected_gauge_id")
        .in("user_id", userIds);
      if (userSettingsError) throw userSettingsError;

      const { data: gaugeSettings, error: settingsError } = await admin
        .from("user_gauge_settings")
        .select("user_id, gauge_id, alert_enabled, alert_threshold_cm")
        .eq("gauge_id", payload.gauge_id!);
      if (settingsError) throw settingsError;

      const selectedByUser = new Map((userSettings ?? []).map((row) => [row.user_id, row]));
      const alertByUser = new Map((gaugeSettings ?? []).map((row) => [row.user_id, row]));

      targets = targets.filter((sub) => {
        const selected = selectedByUser.get(sub.user_id);
        const setting = alertByUser.get(sub.user_id);

        // A threshold warning is sent only for the gauge the user currently selected.
        if (!selected || selected.selected_gauge_id !== payload.gauge_id) return false;
        if (!setting?.alert_enabled) return false;

        const threshold = Number(setting.alert_threshold_cm ?? payload.threshold_cm ?? 225);
        return payload.current_cm !== undefined && payload.current_cm < threshold &&
          (payload.previous_cm === undefined || payload.previous_cm >= threshold);
      });

      // Standardized warning text: no icons and no Reffenthal-entry wording.
      notificationBody = formatThresholdBody({
        ...payload,
        threshold_cm: payload.threshold_cm,
      });
    }

    const privateJwk = config.private_key_jwk as JsonWebKey;
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

    const notification = {
      title: payload.title,
      body: notificationBody,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      navigate: payload.url ?? "/",
    };
    const wirePayload = JSON.stringify({
      web_push: "8030",
      notification,
      title: payload.title,
      body: notificationBody,
      url: payload.url ?? "/",
    });

    const results: Array<{ endpoint: string; user_id: string; ok: boolean; status?: number; reason?: string }> = [];
    for (const subscription of targets) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        });
        await subscriber.pushTextMessage(wirePayload, { ttl: 300, urgency: "high" });
        results.push({ endpoint: subscription.endpoint, user_id: subscription.user_id, ok: true });
      } catch (error) {
        let status: number | undefined;
        let reason: string | undefined;
        if (error instanceof webpush.PushMessageError) {
          status = error.response.status;
          try { reason = (await error.response.clone().text()).slice(0, 500); } catch { /* ignore */ }
          if (error.isGone()) await admin.from("web_push_subscriptions").delete().eq("id", subscription.id);
        } else {
          reason = error instanceof Error ? error.message : String(error);
        }
        console.error("[send-event-push] push failed", { status, reason });
        results.push({ endpoint: subscription.endpoint, user_id: subscription.user_id, ok: false, status, reason });
      }
    }

    const sent = results.filter((result) => result.ok).length;
    return json({ ok: sent > 0, event_type: payload.event_type, targeted: targets.length, sent, results }, sent > 0 || targets.length === 0 ? 200 : 502);
  } catch (error) {
    console.error("[send-event-push] fatal", error);
    return json({ error: error instanceof Error ? error.message : "Push-Versand fehlgeschlagen" }, 500);
  }
});
