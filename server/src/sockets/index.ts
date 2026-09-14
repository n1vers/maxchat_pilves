import { Server, Socket } from "socket.io";
import { auth, db } from "../firebaseAdmin";
import { redis } from "../redisClient";

const GENERAL_KEY = "chat:general";
const HISTORY_LIMIT = 100;
const MAX_MEDIA_BYTES = 6 * 1024 * 1024;
const MEDIA_TTL_SECONDS = 60 * 60 * 24 * 30;

interface ChatMedia {
  id: string;
  mime: string;
  name: string;
  dataUrl?: string;
}

interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  ts: number;
  replyTo?: { id: string; fromName: string; text: string } | null;
  media?: ChatMedia | null;
}

function dmKey(a: string, b: string) {
  return `dm:${[a, b].sort().join(":")}`;
}

function mediaKey(id: string) {
  return `media:${id}`;
}

function validateMedia(media: any) {
  if (!media || typeof media.dataUrl !== "string" || typeof media.mime !== "string") return null;
  if (!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(media.mime)) return null;
  const comma = media.dataUrl.indexOf(",");
  if (comma < 0) return null;
  const base64 = media.dataUrl.slice(comma + 1);
  const approxBytes = Math.floor(base64.length * 0.75);
  if (approxBytes > MAX_MEDIA_BYTES) return null;
  return {
    mime: media.mime.toLowerCase(),
    name: typeof media.name === "string" ? media.name.slice(0, 120) : "image",
    dataUrl: media.dataUrl,
  };
}

async function storeMedia(media: any): Promise<ChatMedia | null> {
  const valid = validateMedia(media);
  if (!valid) return null;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await redis.set(mediaKey(id), valid.dataUrl, "EX", MEDIA_TTL_SECONDS);
  return { id, mime: valid.mime, name: valid.name };
}

async function hydrateMessage(message: ChatMessage): Promise<ChatMessage> {
  if (!message.media?.id) return message;
  const dataUrl = await redis.get(mediaKey(message.media.id));
  if (!dataUrl) return message;
  return { ...message, media: { ...message.media, dataUrl } };
}

async function hydrateMessages(raw: string[]) {
  const parsed = raw.map((r) => JSON.parse(r) as ChatMessage);
  return Promise.all(parsed.map(hydrateMessage));
}

export function setupSockets(io: Server) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Нет токена"));
      const decoded = await auth.verifyIdToken(token);
      (socket as any).uid = decoded.uid;
      const snap = await db.collection("users").doc(decoded.uid).get();
      (socket as any).name = snap.exists
        ? snap.data()?.displayName || decoded.email || decoded.uid
        : decoded.email || decoded.uid;
      next();
    } catch {
      next(new Error("Невалидный токен"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const uid: string = (socket as any).uid;
    const name: string = (socket as any).name;

    socket.join("general");
    socket.join(`user:${uid}`);

    socket.on("profile:update", (displayName: string) => {
      if (typeof displayName === "string" && displayName.trim()) {
        (socket as any).name = displayName.trim().slice(0, 30);
      }
    });

    socket.on("history:general", async (cb) => {
      const raw = await redis.lrange(GENERAL_KEY, -HISTORY_LIMIT, -1);
      cb(await hydrateMessages(raw));
    });

    socket.on("message:delete:general", async (messageId: string) => {
      if (typeof messageId !== "string" || !messageId) return;
      const raw = await redis.lrange(GENERAL_KEY, 0, -1);
      let target: ChatMessage | null = null;
      const kept: string[] = [];
      for (const item of raw) {
        try {
          const msg = JSON.parse(item) as ChatMessage;
          if (msg.id === messageId) {
            if (msg.from !== uid) return;
            target = msg;
          } else kept.push(item);
        } catch { kept.push(item); }
      }
      if (!target) return;
      const tx = redis.multi();
      tx.del(GENERAL_KEY);
      if (kept.length) tx.rpush(GENERAL_KEY, ...kept);
      if (target.media?.id) tx.del(mediaKey(target.media.id));
      await tx.exec();
      io.to("general").emit("message:deleted", { chat: "general", id: messageId });
    });

    socket.on("message:general", async (payload: any) => {
      const text = typeof payload === "string" ? payload : payload?.text;
      const replyTo = typeof payload === "string" ? null : payload?.replyTo || null;
      const media = typeof payload === "string" ? null : await storeMedia(payload?.media);
      if (!text?.trim() && !media) return;

      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: uid,
        fromName: (socket as any).name || name,
        text: String(text || "").trim(),
        ts: Date.now(),
        replyTo,
        media,
      };
      await redis.rpush(GENERAL_KEY, JSON.stringify(msg));
      await redis.ltrim(GENERAL_KEY, -1000, -1);
      io.to("general").emit("message:general", await hydrateMessage(msg));
    });

    socket.on("history:dm", async (partnerUid: string, cb) => {
      const raw = await redis.lrange(dmKey(uid, partnerUid), -HISTORY_LIMIT, -1);
      cb(await hydrateMessages(raw));
    });

    socket.on("message:dm", async ({ to, text, replyTo, media }: { to: string; text: string; replyTo?: ChatMessage["replyTo"]; media?: any }) => {
      if (!to) return;
      const storedMedia = await storeMedia(media);
      if (!text?.trim() && !storedMedia) return;

      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: uid,
        fromName: (socket as any).name || name,
        text: String(text || "").trim(),
        ts: Date.now(),
        replyTo: replyTo || null,
        media: storedMedia,
      };
      const key = dmKey(uid, to);
      await redis.rpush(key, JSON.stringify(msg));
      await redis.ltrim(key, -1000, -1);
      await redis.sadd(`conv:${uid}`, to);
      await redis.sadd(`conv:${to}`, uid);

      const hydrated = await hydrateMessage(msg);
      io.to(`user:${to}`).emit("message:dm", { ...hydrated, to });
      socket.emit("message:dm", { ...hydrated, to });
    });

    socket.on("message:delete:dm", async ({ to, id }: { to: string; id: string }) => {
      if (!to || !id) return;
      const key = dmKey(uid, to);
      const raw = await redis.lrange(key, 0, -1);
      let target: ChatMessage | null = null;
      const kept: string[] = [];
      for (const item of raw) {
        try {
          const msg = JSON.parse(item) as ChatMessage;
          if (msg.id === id) {
            if (msg.from !== uid) return;
            target = msg;
          } else kept.push(item);
        } catch { kept.push(item); }
      }
      if (!target) return;
      const tx = redis.multi();
      tx.del(key);
      if (kept.length) tx.rpush(key, ...kept);
      if (target.media?.id) tx.del(mediaKey(target.media.id));
      await tx.exec();
      io.to(`user:${uid}`).emit("message:deleted", { chat: to, id });
      io.to(`user:${to}`).emit("message:deleted", { chat: uid, id });
    });

    socket.on("conversations", async (cb) => {
      cb(await redis.smembers(`conv:${uid}`));
    });
  });
}
