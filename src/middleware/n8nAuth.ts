import { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/ApiError";

export const n8nAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const apiKey = process.env.N8N_API_KEY;

  if (!apiKey) {
    return next(new ApiError(500, "N8N_API_KEY is not configured on the server"));
  }

  const provided =
    req.headers["x-n8n-key"] as string | undefined ??
    (() => {
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) return auth.slice(7);
      return undefined;
    })();

  if (!provided || provided !== apiKey) {
    return next(new ApiError(401, "Invalid or missing N8N API key"));
  }

  next();
};
