import express from "express";
import path from "path";
import { createServer as createHttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Real-time Rooms
  const rooms = new Map<string, { users: Set<string>; messages: any[] }>();

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join-room", (roomId: string, username: string) => {
      socket.join(roomId);
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { users: new Set(), messages: [] });
      }
      rooms.get(roomId)?.users.add(username);
      
      // Notify others
      io.to(roomId).emit("user-joined", {
        username,
        users: Array.from(rooms.get(roomId)?.users || [])
      });

      // Send history
      socket.emit("room-history", rooms.get(roomId)?.messages || []);
    });

    socket.on("send-message", (roomId: string, message: { username: string; text: string }) => {
      const room = rooms.get(roomId);
      if (room) {
        room.messages.push(message);
        if (room.messages.length > 50) room.messages.shift();
        io.to(roomId).emit("new-message", message);
      }
    });

    socket.on("toggle-audio", (roomId: string, username: string, isEnabled: boolean) => {
      io.to(roomId).emit("user-audio-changed", { username, isEnabled });
    });

    socket.on("signal", (data: { roomId: string; to: string; signal: any; from: string }) => {
      io.to(data.to).emit("signal", {
        signal: data.signal,
        from: data.from
      });
    });

    socket.on("leave-room", (roomId: string, username: string) => {
      socket.leave(roomId);
      rooms.get(roomId)?.users.delete(username);
      io.to(roomId).emit("user-left", {
        username,
        users: Array.from(rooms.get(roomId)?.users || [])
      });
    });

    socket.on("disconnect", () => {
      console.log("A user disconnected");
    });
  });

  // API Route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
