import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ApiError } from "../lib/ApiError";

export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Zod validation errors → 400 with field-level details
  if (err.name === "ZodError" && Array.isArray(err.issues)) {
    const errors = err.issues.map((issue: any) => ({
      field: issue.path?.join(".") || "unknown",
      message: issue.message,
    }));
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
    return;
  }

  // Prisma known errors (check by code string to avoid import issues with adapter)
  if (err?.code && typeof err.code === "string" && err.clientVersion) {
    // Unique constraint violation → 409
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[]) || [];
      res.status(409).json({
        success: false,
        message: `Unique constraint violation on: ${target.join(", ") || "field"}`,
      });
      return;
    }
    // Record not found → 404
    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        message: "Record not found",
      });
      return;
    }
    // Foreign key constraint → 400
    if (err.code === "P2003") {
      res.status(400).json({
        success: false,
        message: "Related record not found",
      });
      return;
    }
  }

  // ApiError instances → their own status code
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  // Unexpected errors → 500, generic message, no stack trace
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};
