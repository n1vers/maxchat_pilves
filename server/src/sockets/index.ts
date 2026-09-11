import { Server, Socket } from "socket.io";
import { auth } from "../firebaseAdmin";
import { redis } from "../redisClient";

const GENERAL_KEY = "chat:general";
const HISTORY_LIMIT = 100;

interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  ts: number;
  replyTo?: { id: string; fromName: string; text: string } | null;
}

function dmKey(a: string, b: string) {
  return `dm:${[a, b].sort().join(":")}`;
}

export function setupSockets(io: Server) {
  // Аутентификация сокета через Firebase ID токен
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Нет токена"));
      const decoded = await auth.verifyIdToken(token);
      (socket as any).uid = decoded.uid;
      const snap = await (await import("../firebaseAdmin")).db.collection("users").doc(decoded.uid).get();
      (socket as any).name = snap.exists ? (snap.data()?.displayName || decoded.email || decoded.uid) : (decoded.email || decoded.uid);
      next();
    } catch (e) {
      next(new Error("Невалидный токен"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const uid: string = (socket as any).uid;
    const name: string = (socket as any).name;

    socket.join("general");
    socket.join(`user:${uid}`);

    socket.on("profile:update", (displayName: string) => {
      if (typeof displayName === "string" && displayName.trim()) (socket as any).name = displayName.trim().slice(0, 30);
    });

    // История общего чата
    socket.on("history:general", async (cb) => {
      const raw = await redis.lrange(GENERAL_KEY, -HISTORY_LIMIT, -1);
      cb(raw.map((r) => JSON.parse(r)));
    });

    // Сообщение в общий чат
    socket.on("message:general", async (payload: string | { text: string; replyTo?: ChatMessage["replyTo"] }) => {
      const text = typeof payload === "string" ? payload : payload?.text;
      const replyTo = typeof payload === "string" ? null : payload?.replyTo || null;
      if (!text?.trim()) return;
      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: uid,
        fromName: name,
        text: text.trim(),
        ts: Date.now(),
        replyTo,
      };
      await redis.rpush(GENERAL_KEY, JSON.stringify(msg));
      await redis.ltrim(GENERAL_KEY, -1000, -1); // храним последние 1000 сообщений
      io.to("general").emit("message:general", msg);
    });

    // История переписки с конкретным пользователем
    socket.on("history:dm", async (partnerUid: string, cb) => {
      const raw = await redis.lrange(dmKey(uid, partnerUid), -HISTORY_LIMIT, -1);
      cb(raw.map((r) => JSON.parse(r)));
    });

    // Личное сообщение
    socket.on("message:dm", async ({ to, text, replyTo }: { to: string; text: string; replyTo?: ChatMessage["replyTo"] }) => {
      if (!text?.trim() || !to) return;
      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: uid,
        fromName: name,
        text: text.trim(),
        ts: Date.now(),
        replyTo: replyTo || null,
      };
      const key = dmKey(uid, to);
      await redis.rpush(key, JSON.stringify(msg));
      await redis.ltrim(key, -1000, -1);

      // сохраняем список собеседников для обеих сторон
      await redis.sadd(`conv:${uid}`, to);
      await redis.sadd(`conv:${to}`, uid);

      io.to(`user:${to}`).emit("message:dm", { ...msg, to });
      socket.emit("message:dm", { ...msg, to }); // эхо себе (для др. вкладок/устройств)
    });

    // Список активных переписок текущего пользователя
    socket.on("conversations", async (cb) => {
      const partners = await redis.smembers(`conv:${uid}`);
      cb(partners);
    });
  });
}
