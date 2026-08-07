import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── NfB-Monitor Proxy ──────────────────────────────────────────────────────────
// Leitet alle /nfb-Anfragen an den Flask-NfB-Monitor-Prozess weiter.
// Der Flask-Server läuft auf Port 5150 (NfB-Monitor-Workflow).
app.use(
  "/nfb",
  createProxyMiddleware({
    target: "http://localhost:5150",
    changeOrigin: true,
    on: {
      error: (_err, _req, res) => {
        // Flask noch nicht bereit → 503 statt Express-Absturz
        if (res && "writeHead" in res) {
          (res as import("http").ServerResponse).writeHead(503, {
            "Content-Type": "text/html; charset=utf-8",
          });
          (res as import("http").ServerResponse).end(
            "<h2>NfB-Monitor startet …</h2><p>Bitte kurz warten und neu laden.</p>",
          );
        }
      },
    },
  }),
);

export default app;
