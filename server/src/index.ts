import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient } from "./redisClient";
import usersRouter from "./routes/users";
import { setupSockets } from "./sockets";

const app = express();
// CLIENT_ORIGIN нужен только если клиент живёт на ДРУГОМ домене/сервисе.
// При деплое одним сервисом (клиент отдаётся этим же сервером) можно не указывать.
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/users", usersRouter);

// Отдаём собранный клиент (client/dist), если он есть рядом.
// Так один Node-процесс обслуживает и API/сокеты, и статику фронтенда.
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("client/dist не найден — соберите клиент (npm run build)");
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 8 * 1024 * 1024,
  cors: { origin: process.env.CLIENT_ORIGIN || true, credentials: true },
});

// Redis-адаптер нужен, если на Render запущено несколько инстансов сервера —
// иначе сообщения не дойдут до сокетов, подключённых к другому инстансу.
io.adapter(createAdapter(pubClient, subClient));

setupSockets(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
