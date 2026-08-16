import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request, adminClient: ReturnType<typeof createClient>) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return null;
  return user.app_metadata?.role === "admin" ? user : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server push configuration missing" }, 500);

  const adminClient = createClient(url, serviceKey);
  const admin = await requireAdmin(req, adminClient);
  if (!admin) return json({ error: "Forbidden" }, 403);

  try {
    const { data: config, error: configError } = await adminClient
      .from("web_push_vapid_config")
      .select("public_key, private_key_jwk")
      .eq("id", true)
      .single();
    if (configError || !config) throw new Error("VAPID-Konfiguration fehlt.");

    if (req.method === "GET") {
      const { data: subscriptions, error: subError } = await adminClient
        .from("web_push_subscriptions")
        .select("user_id, endpoint, updated_at")
        .order("updated_at", { ascending: false });
      if (subError) throw subError;

      const users = [];
      for (const sub of subscriptions ?? []) {
        const { data: userData } = await adminClient.auth.admin.getUserById(sub.user_id);
        if (userData.user) {
          users.push({
            user_id: sub.user_id,
            email: userData.user.email ?? "",
            updated_at: sub.updated_at,
          });
        }
      }
      const unique = [...new Map(users.map((u) => [u.user_id, u])).values()];
      return json({ users: unique });
    }

    const payload = await req.json() as {
      user_ids?: string[];
      title?: string;
      body?: string;
      url?: string;
    };
    const userIds = [...new Set(payload.user_ids ?? [])];
    const title = (payload.title ?? "R(h)einschiffer").trim();
    const body = (payload.body ?? "").trim();
    if (!userIds.length) return json({ error: "Mindestens einen Nutzer auswählen." }, 400);
    if (!body) return json({ error: "Nachricht darf nicht leer sein." }, 400);
    if (userIds.length > 50) return json({ error: "Maximal 50 Nutzer pro Versand." }, 400);

    const { data: subscriptions, error: subError } = await adminClient
      .from("web_push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (subError) throw subError;

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

    const results: Array<{ user_id: string; ok: boolean; status?: number; reason?: string }> = [];
    for (const sub of subscriptions ?? []) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        });
        const notification = {
          title,
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          navigate: payload.url ?? "/",
        };
        await subscriber.pushTextMessage(JSON.stringify({
          web_push: "8030",
          notification,
          title,
          body,
          url: payload.url ?? "/",
        }), { ttl: 300, urgency: "high" });
        results.push({ user_id: sub.user_id, ok: true });
      } catch (error) {
        let status: number | undefined;
        let reason: string | undefined;
        if (error instanceof webpush.PushMessageError) {
          status = error.response.status;
          try { reason = (await error.response.clone().text()).slice(0, 500); } catch { /* ignore */ }
          if (error.isGone()) await adminClient.from("web_push_subscriptions").delete().eq("id", sub.id);
        } else {
          reason = error instanceof Error ? error.message : String(error);
        }
        results.push({ user_id: sub.user_id, ok: false, status, reason });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return json({ ok: sent > 0, targeted: userIds.length, subscribed: subscriptions?.length ?? 0, sent, results });
  } catch (error) {
    console.error("[admin-push] fatal", error);
    return json({ error: error instanceof Error ? error.message : "Push-Versand fehlgeschlagen" }, 500);
  }
});
