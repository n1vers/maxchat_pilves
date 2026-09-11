import { Request, Response, NextFunction } from "express";
import { auth } from "../firebaseAdmin";

export interface AuthedRequest extends Request {
  uid?: string;
  email?: string;
}

export async function verifyToken(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Нет токена" });

  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (e) {
    res.status(401).json({ error: "Невалидный токен" });
  }
}
