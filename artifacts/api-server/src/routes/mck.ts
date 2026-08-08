import { Router, type IRouter } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const router: IRouter = Router();

const __distDir = path.dirname(fileURLToPath(import.meta.url));
// reffenthal-waechter/mck.json liegt 3 Ebenen über dist/routes/
const MCK_JSON = path.resolve(
  __distDir,
  "../../../reffenthal-waechter/mck.json",
);

const FALLBACK = {
  source: "MCK Kurpfalz Mannheim",
  petrol: null,
  diesel: null,
  unit: "€/l",
  sourceDate: null,
  checkedAt: null,
  error: "mck.json noch nicht vorhanden – bitte Wächter einmal starten",
};

router.get("/mck", (_req, res): void => {
  try {
    if (fs.existsSync(MCK_JSON)) {
      const raw = JSON.parse(fs.readFileSync(MCK_JSON, "utf8"));
      res.json(raw);
    } else {
      res.json(FALLBACK);
    }
  } catch (err) {
    res.json({ ...FALLBACK, error: String(err) });
  }
});

export default router;
