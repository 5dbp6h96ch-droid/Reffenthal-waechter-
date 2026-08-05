import { Router, type IRouter } from "express";
import healthRouter from "./health";
import waechterRouter from "./waechter";

const router: IRouter = Router();

router.use(healthRouter);
router.use(waechterRouter);

export default router;
