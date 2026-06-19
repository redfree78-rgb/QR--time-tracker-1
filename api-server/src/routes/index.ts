import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import sessionsRouter from "./sessions";
import accountsRouter from "./accounts";
import positionsRouter from "./positions";
import auditLogsRouter from "./audit-logs";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

// All routes below require login
router.use(requireAuth);

router.use(usersRouter);
router.use(sessionsRouter);
router.use(accountsRouter);
router.use(positionsRouter);
router.use(auditLogsRouter);

export default router;
