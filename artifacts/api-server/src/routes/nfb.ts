import { Router, type IRouter } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { GetNfbResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Resolve the NfB SQLite database relative to the compiled bundle.
// At runtime import.meta.url → <root>/artifacts/api-server/dist/index.mjs
// Three levels up reaches the monorepo root.
const __distDir = path.dirname(fileURLToPath(import.meta.url));
const NfB_DB = path.resolve(__distDir, "../../../artifacts/nfb-monitor/nfb.db");

// A notice is considered "new" if it was first seen within the last 24 hours.
const NfB_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

router.get("/nfb", (req, res): void => {
  let db: DatabaseSync | null = null;
  try {
    try {
      db = new DatabaseSync(NfB_DB);
    } catch (openErr) {
      // DB not initialised yet (NfB-Monitor hasn't run) – return empty list
      req.log.warn({ openErr, path: NfB_DB }, "NfB DB not available – returning empty list");
      res.json(GetNfbResponse.parse({ meldungen: [], count: 0 }));
      return;
    }

    const stmt = db.prepare(
      "SELECT nfb_id, titel, km_von, km_bis, gueltig_ab, gueltig_bis, url, first_seen " +
        "FROM nfb WHERE expired=0 ORDER BY first_seen DESC",
    );
    const rows = stmt.all() as {
      nfb_id: string;
      titel: string;
      km_von: number | null;
      km_bis: number | null;
      gueltig_ab: string | null;
      gueltig_bis: string | null;
      url: string | null;
      first_seen: string;
    }[];

    const now = Date.now();
    const meldungen = rows.map((row) => ({
      nfb_id: row.nfb_id,
      titel: row.titel,
      km_von: row.km_von ?? null,
      km_bis: row.km_bis ?? null,
      gueltig_ab: row.gueltig_ab ?? null,
      gueltig_bis: row.gueltig_bis ?? null,
      url: row.url ?? null,
      first_seen: row.first_seen,
      is_new: now - new Date(row.first_seen).getTime() < NfB_NEW_WINDOW_MS,
    }));

    const data = GetNfbResponse.parse({ meldungen, count: meldungen.length });
    res.json(data);
  } catch (err) {
    req.log.error({ err, db: NfB_DB }, "Failed to read NfB database");
    res.status(503).json({ error: "Could not load NfB data", path: NfB_DB });
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors
    }
  }
});

export default router;
