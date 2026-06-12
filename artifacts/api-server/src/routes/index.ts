import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import assetsRouter from "./assets";
import adminRouter from "./admin";
import storageRouter from "./storage";
import matrixRouter from "./matrix";
import custodyRouter from "./custody";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(assetsRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(matrixRouter);
router.use(custodyRouter);

export default router;
