import { Router, type IRouter } from "express";
import healthRouter from "./health";
import waechterRouter from "./waechter";
import nfbRouter from "./nfb";
import mckRouter from "./mck";

const router: IRouter = Router();

router.use(healthRouter);
router.use(waechterRouter);
router.use(nfbRouter);
router.use(mckRouter);

export default router;
