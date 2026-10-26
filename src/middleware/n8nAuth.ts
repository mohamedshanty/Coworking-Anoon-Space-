import { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/ApiError";
import { N8N_API_KEY } from "../lib/env";

/**
 * API-key auth for n8n-triggered endpoints (e.g. WhatsApp churn outreach).
 * These routes are machine-to-machine and do NOT carry a JWT, so they are
 * guarded by a shared key sent via `x-n8n-key` header or `Bearer` token.
 */
export const n8nAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!N8N_API_KEY) {
    return next(
      new ApiError(500, "N8N_API_KEY is not configured on the server"),
    );
  }

  const provided =
    (req.headers["x-n8n-key"] as string | undefined) ??
    (() => {
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) return auth.slice(7);
      return undefined;
    })();

  if (!provided || provided !== N8N_API_KEY) {
    return next(new ApiError(401, "Invalid or missing N8N API key"));
  }

  next();
};
