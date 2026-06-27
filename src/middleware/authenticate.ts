import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/ApiError";
import dotenv from "dotenv";

dotenv.config();

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "default_access_secret";

export interface AuthenticatedUser {
  id: string;
  name: string;
  username: string;
  role: "admin" | "manager" | "staff";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Access token is missing or invalid");
    }

    const token = authHeader.split(" ")[1];

    let decoded: any;
    try {
      decoded = jwt.verify(token, ACCESS_SECRET);
    } catch (err) {
      throw new ApiError(401, "Access token is expired or invalid");
    }

    const user = await prisma.staff.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      throw new ApiError(401, "User session not found in database");
    }

    req.user = user as AuthenticatedUser;
    next();
  } catch (error) {
    next(error);
  }
};
