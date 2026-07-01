"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const dotenv_1 = __importDefault(require("dotenv"));
const socket_io_1 = require("socket.io");
const app_1 = __importDefault(require("./app"));
dotenv_1.default.config();
const PORT = process.env.PORT || 5000;
const server = http_1.default.createServer(app_1.default);
// Setup Socket.io
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
io.on("connection", (socket) => {
    console.log(`Socket client connected: ${socket.id}`);
    socket.on("disconnect", () => {
        console.log(`Socket client disconnected: ${socket.id}`);
    });
});
// Expose io on app so routes can use it to broadcast events
app_1.default.set("io", io);
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
