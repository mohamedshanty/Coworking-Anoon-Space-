import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "../../lib/ApiError";

export function verifyInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SYNC_SECRET ?? "";
  const provided = req.get("X-Internal-Secret") ?? "";

  if (!expected) {
    console.error("[AnoonCheckIn] INTERNAL_SYNC_SECRET is not configured — rejecting request");
    next(new ApiError(500, "Integration is not configured"));
    return;
  }

  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  const providedDigest = crypto.createHash("sha256").update(provided, "utf8").digest();

  if (!crypto.timingSafeEqual(expectedDigest, providedDigest)) {
    next(new ApiError(401, "Invalid internal secret"));
    return;
  }

  next();
}
