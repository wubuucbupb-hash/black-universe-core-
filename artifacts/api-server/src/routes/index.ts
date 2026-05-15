import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import assetsRouter from "./assets";
import adminRouter from "./admin";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(assetsRouter);
router.use(adminRouter);
router.use(storageRouter);

export default router;
