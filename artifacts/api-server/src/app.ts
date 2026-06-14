import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { verifyAuthToken } from "./lib/authToken";

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

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set.");
}

const PgSession = connectPgSimple(session);

// Behind the Replit reverse proxy; required for secure cookies in production.
app.set("trust proxy", 1);

app.use(
  session({
    // Persist sessions in Postgres so logins survive server restarts/deploys.
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// Bearer-token bridge for non-browser clients (the mobile app). When a request
// carries a valid `Authorization: Bearer <token>` and no session is already
// established, resolve the token to its userId and populate the session for the
// duration of the request. Route handlers continue to read req.session.userId,
// so no per-route changes are needed and all existing ownership/ACL checks
// still apply.
app.use((req, _res, next) => {
  if (!req.session.userId) {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const userId = verifyAuthToken(header.slice("Bearer ".length).trim());
      if (userId) {
        req.session.userId = userId;
      }
    }
  }
  next();
});

app.use("/api", router);

export default app;
