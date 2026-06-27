import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";
import app from "./app";

dotenv.config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
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
app.set("io", io);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
