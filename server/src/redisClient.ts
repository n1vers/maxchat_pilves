import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Основной клиент — для чтения/записи истории сообщений
export const redis = new Redis(REDIS_URL);

// Отдельные соединения для Pub/Sub (socket.io-redis-adapter требует именно так)
export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

redis.on("error", (e) => console.error("Redis error:", e.message));
