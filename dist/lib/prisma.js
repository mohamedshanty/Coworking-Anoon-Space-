"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const connectionString = process.env.DATABASE_URL;
let prisma;
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
if (process.env.NODE_ENV === "production") {
    exports.prisma = prisma = new client_1.PrismaClient({ adapter });
}
else {
    if (!global.prisma) {
        global.prisma = new client_1.PrismaClient({ adapter });
    }
    exports.prisma = prisma = global.prisma;
}
