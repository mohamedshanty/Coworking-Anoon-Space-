import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";
import app from "./app";

// Validate required env vars and load CORS origins
import { ALLOWED_ORIGINS } from "./lib/env";
import { prisma } from "./lib/prisma";

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log(`Socket client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Expose io on app so routes can use it to broadcast events
app.set("io", io);

// Seed default rooms on startup (idempotent — won't create duplicates)
async function seedRooms() {
  const defaultRooms = ["قاعة الإدارة", "القاعة A", "القاعة B"];

  for (const name of defaultRooms) {
    const existing = await prisma.room.findFirst({ where: { name } });
    if (!existing) {
      await prisma.room.create({ data: { name } });
      console.log(`Created room: ${name}`);
    }
  }
  console.log("Default rooms ensured.");
}

seedRooms().catch((err) => {
  console.error("Failed to seed rooms:", err);
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
