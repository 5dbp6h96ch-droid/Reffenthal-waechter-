import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

// Wird vom Client (useWebPushPrompt) nach der Aktivierung aufgerufen.
// Authentifizierung: Nutzer-JWT im Authorization-Header (supabase.functions.invoke).
// Sendet einen Test-Push an alle Subscriptions des angemeldeten Nutzers.

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

function getServerKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretMap = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  for (const value of Object.values(secretMap)) {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "key" in value && typeof (value as { key: unknown }).key === "string") {
      return (value as { key: string }).key;
    }
  }
  throw new Error("No server key configured");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const secretKey = getServerKey();
    const admin = createClient(supabaseUrl, secretKey);

    // Nutzer aus dem mitgesendeten JWT ermitteln.
    const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!jwt) return json({ error: "Unauthorized" }, 401);
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { data: config, error: configError } = await admin
      .from("web_push_vapid_config")
      .select("public_key, private_key_jwk")
      .eq("id", true)
      .single();
    if (configError || !config) throw new Error("VAPID-Konfiguration fehlt.");

    const { data: subscriptions, error: subError } = await admin
      .from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) {
      return json({ error: "Keine Push-Subscription für diesen Nutzer gefunden." }, 404);
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

    const title = "Push-Nachrichten aktiv";
    const body = "Test erfolgreich – du erhältst jetzt Pegel- und WSV-Meldungen.";
    const wirePayload = JSON.stringify({
      web_push: "8030",
      notification: { title, body, icon: "/icon-192.png", badge: "/icon-192.png", navigate: "/" },
      title,
      body,
      url: "/",
    });

    let sent = 0;
    const failures: Array<{ status?: number; reason?: string }> = [];
    for (const subscription of subscriptions) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        });
        await subscriber.pushTextMessage(wirePayload, { ttl: 300, urgency: "high" });
        sent++;
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
        console.error("[send-test-push] push failed", { status, reason });
        failures.push({ status, reason });
      }
    }

    if (sent === 0) return json({ error: "Test-Push konnte nicht zugestellt werden.", failures }, 502);
    return json({ ok: true, sent });
  } catch (error) {
    console.error("[send-test-push] fatal", error);
    return json({ error: error instanceof Error ? error.message : "Test-Push fehlgeschlagen" }, 500);
  }
});
