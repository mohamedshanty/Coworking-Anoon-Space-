"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const ApiError_1 = require("../lib/ApiError");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "default_access_secret";
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw new ApiError_1.ApiError(401, "Access token is missing or invalid");
        }
        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
        }
        catch (err) {
            throw new ApiError_1.ApiError(401, "Access token is expired or invalid");
        }
        const user = await prisma_1.prisma.staff.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                name: true,
                username: true,
                role: true,
            },
        });
        if (!user) {
            throw new ApiError_1.ApiError(401, "User session not found in database");
        }
        req.user = user;
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.authenticate = authenticate;
