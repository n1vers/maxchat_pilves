import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient } from "./redisClient";
import usersRouter from "./routes/users";
import { setupSockets } from "./sockets";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/users", usersRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*" },
});

// Redis-адаптер нужен, если на Render запущено несколько инстансов сервера —
// иначе сообщения не дойдут до сокетов, подключённых к другому инстансу.
io.adapter(createAdapter(pubClient, subClient));

setupSockets(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
