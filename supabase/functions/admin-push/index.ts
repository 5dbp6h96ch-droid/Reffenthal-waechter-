import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request, admin: ReturnType<typeof createClient>) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { user: null, error: json({ error: "Unauthorized" }, 401) };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { user: null, error: json({ error: "Unauthorized" }, 401) };

  // Security boundary: only Supabase Auth app_metadata is trusted for roles.
  if (data.user.app_metadata?.role !== "admin") {
    return { user: null, error: json({ error: "Forbidden" }, 403) };
  }
  return { user: data.user, error: null };
}

async function listAllUsers(admin: ReturnType<typeof createClient>) {
  const users: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }> = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration missing" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const auth = await requireAdmin(req, admin);
  if (auth.error) return auth.error;

  try {
    const body = await req.json() as {
      action?: "list" | "send";
      target_user_ids?: string[];
      title?: string;
      message?: string;
      url?: string;
    };

    if (body.action === "list") {
      const [{ data: subscriptions, error: subError }, { data: profiles, error: profileError }, users] = await Promise.all([
        admin.from("web_push_subscriptions").select("user_id, updated_at"),
        admin.from("profiles").select("id, username, full_name"),
        listAllUsers(admin),
      ]);
      if (subError) throw subError;
      if (profileError) throw profileError;

      const pushByUser = new Map<string, { count: number; lastPushAt: string | null }>();
      for (const sub of subscriptions ?? []) {
        const current = pushByUser.get(sub.user_id) ?? { count: 0, lastPushAt: null };
        current.count += 1;
        if (!current.lastPushAt || (sub.updated_at && sub.updated_at > current.lastPushAt)) current.lastPushAt = sub.updated_at;
        pushByUser.set(sub.user_id, current);
      }
      const profileByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

      const result = users
        .filter((user) => pushByUser.has(user.id))
        .map((user) => {
          const push = pushByUser.get(user.id)!;
          const profile = profileByUser.get(user.id);
          return {
            id: user.id,
            email: user.email ?? "",
            name: profile?.full_name ?? profile?.username ?? "",
            pushCount: push.count,
            lastPushAt: push.lastPushAt,
          };
        })
        .sort((a, b) => (a.email || a.name).localeCompare(b.email || b.name, "de"));

      return json({ ok: true, users: result });
    }

    if (body.action !== "send") return json({ error: "action must be list or send" }, 400);

    const targetUserIds = [...new Set((body.target_user_ids ?? []).filter((id) => typeof id === "string" && id.length > 0))];
    const title = body.title?.trim() ?? "";
    const message = body.message?.trim() ?? "";
    const url = body.url?.trim() || "/";
    if (!targetUserIds.length) return json({ error: "Mindestens ein Empfänger muss ausgewählt werden." }, 400);
    if (!title || !message) return json({ error: "Titel und Nachricht sind erforderlich." }, 400);
    if (title.length > 120 || message.length > 1000) return json({ error: "Titel oder Nachricht ist zu lang." }, 400);

    const [{ data: config, error: configError }, { data: subscriptions, error: subError }, users] = await Promise.all([
      admin.from("web_push_vapid_config").select("public_key, private_key_jwk").eq("id", true).single(),
      admin.from("web_push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", targetUserIds),
      listAllUsers(admin),
    ]);
    if (configError || !config) throw new Error("VAPID-Konfiguration fehlt.");
    if (subError) throw subError;

    const emailByUser = new Map(users.map((user) => [user.id, user.email ?? ""]));
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

    const results: Array<{ user_id: string; email: string; ok: boolean; status?: number; reason?: string }> = [];
    for (const subscription of subscriptions ?? []) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        });
        await subscriber.pushTextMessage(JSON.stringify({
          web_push: "8030",
          notification: {
            title,
            body: message,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            navigate: url,
          },
          title,
          body: message,
          url,
        }), { ttl: 300, urgency: "high" });
        results.push({ user_id: subscription.user_id, email: emailByUser.get(subscription.user_id) ?? "", ok: true });
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
        results.push({ user_id: subscription.user_id, email: emailByUser.get(subscription.user_id) ?? "", ok: false, status, reason });
      }
    }

    const sent = results.filter((result) => result.ok).length;
    const failed = results.length - sent;
    const usersWithoutSubscription = targetUserIds.filter((id) => !(subscriptions ?? []).some((sub) => sub.user_id === id));
    return json({ ok: sent > 0, targeted_users: targetUserIds.length, subscriptions: results.length, sent, failed, users_without_push: usersWithoutSubscription, results }, sent > 0 || results.length === 0 ? 200 : 502);
  } catch (error) {
    console.error("[admin-push] fatal", error);
    return json({ error: error instanceof Error ? error.message : "Admin-Push fehlgeschlagen" }, 500);
  }
});
