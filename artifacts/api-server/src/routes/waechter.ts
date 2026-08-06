import { Router, type IRouter } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { db, pegelHistoryTable } from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import { GetWaechterStateResponse, GetWaechterStatusResponse, GetWaechterTrefferResponse, GetWaechterClubsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Resolve data directory relative to this compiled bundle so the path is
// stable regardless of where the process is started from (pnpm dev or
// `node artifacts/api-server/dist/index.mjs` from the repo root).
//
// esbuild bundles all source into a single dist/index.mjs, so at runtime
// import.meta.url points to:  <root>/artifacts/api-server/dist/index.mjs
// Going three levels up (dist → api-server → artifacts → root) reaches the
// monorepo root, then we append reffenthal-waechter/.
const __distDir = path.dirname(fileURLToPath(import.meta.url));
const WAECHTER_DIR = path.resolve(__distDir, "../../../reffenthal-waechter");

const STATE_FILE = path.join(WAECHTER_DIR, "state.json");
const SEEN_FILE = path.join(WAECHTER_DIR, "seen.json");
const RUN_STATUS_FILE = path.join(WAECHTER_DIR, "run_status.json");
const CLUBS_FILE = path.join(WAECHTER_DIR, "clubs_seen.json");

// Threshold from reffenthal-waechter/config.py
const PEGEL_LOW_THRESHOLD_CM = 225;

// Wie viele Tage Verlauf das Dashboard anzeigen soll
const HISTORY_DAYS = 30;

router.get("/waechter/state", async (req, res): Promise<void> => {
  try {
    // Aktuellen Zustand (letzte Messung, Tagesbericht-Datum) aus state.json lesen
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    const state = JSON.parse(raw);

    // Verlauf der letzten HISTORY_DAYS Tage aus der Datenbank lesen
    let dbHistory: { cm: number; ts: string }[] = [];
    try {
      const since = new Date();
      since.setDate(since.getDate() - HISTORY_DAYS);

      const rows = await db
        .select()
        .from(pegelHistoryTable)
        .where(gte(pegelHistoryTable.measuredAt, since))
        .orderBy(desc(pegelHistoryTable.measuredAt))
        .limit(2000);

      dbHistory = rows.map((r) => ({
        cm: r.valueCm,
        ts: r.measuredAt.toISOString(),
      }));
    } catch (dbErr) {
      req.log.warn({ dbErr }, "DB history unavailable – falling back to state.json history");
    }

    // Wenn die DB noch keine Einträge hat, auf den Verlauf aus state.json zurückfallen
    const history =
      dbHistory.length > 0
        ? dbHistory
        : Array.isArray(state.history)
          ? state.history
          : [];

    const data = GetWaechterStateResponse.parse({
      last_pegel_cm: state.last_pegel_cm ?? null,
      last_pegel_time: state.last_pegel_time ?? null,
      last_daily_report_date: state.last_daily_report_date ?? null,
      history,
      threshold_cm: PEGEL_LOW_THRESHOLD_CM,
    });

    res.json(data);
  } catch (err) {
    req.log.error({ err, file: STATE_FILE }, "Failed to read waechter state");
    res.status(503).json({ error: "Could not load water level data", file: STATE_FILE });
  }
});

router.get("/waechter/treffer", async (req, res): Promise<void> => {
  try {
    const raw = await fs.readFile(SEEN_FILE, "utf-8");
    const urls: string[] = JSON.parse(raw);

    const data = GetWaechterTrefferResponse.parse({
      urls: Array.isArray(urls) ? urls : [],
      count: Array.isArray(urls) ? urls.length : 0,
    });

    res.json(data);
  } catch (err) {
    req.log.error({ err, file: SEEN_FILE }, "Failed to read seen.json");
    res.status(503).json({ error: "Could not load treffer data", file: SEEN_FILE });
  }
});

router.get("/waechter/clubs", async (req, res): Promise<void> => {
  try {
    let raw: string;
    try {
      raw = await fs.readFile(CLUBS_FILE, "utf-8");
    } catch {
      // File doesn't exist yet – watcher hasn't found any club hits
      raw = "[]";
    }
    const parsed = JSON.parse(raw);
    const clubs = Array.isArray(parsed) ? parsed : [];

    const data = GetWaechterClubsResponse.parse({
      clubs,
      count: clubs.length,
    });

    res.json(data);
  } catch (err) {
    req.log.error({ err, file: CLUBS_FILE }, "Failed to read clubs_seen.json");
    res.status(503).json({ error: "Could not load club data", file: CLUBS_FILE });
  }
});

router.get("/waechter/status", async (req, res): Promise<void> => {
  try {
    let raw: string;
    try {
      raw = await fs.readFile(RUN_STATUS_FILE, "utf-8");
    } catch {
      // File doesn't exist yet – watcher hasn't run
      raw = JSON.stringify({ last_run_at: null, rss_new_count: 0, last_error: null });
    }
    const parsed = JSON.parse(raw);

    const data = GetWaechterStatusResponse.parse({
      last_run_at: parsed.last_run_at ?? null,
      rss_new_count: parsed.rss_new_count ?? 0,
      last_error: parsed.last_error ?? null,
    });

    res.json(data);
  } catch (err) {
    req.log.error({ err, file: RUN_STATUS_FILE }, "Failed to read waechter run status");
    res.status(503).json({ error: "Could not load watcher run status", file: RUN_STATUS_FILE });
  }
});

export default router;
