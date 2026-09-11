import { Router } from "express";
import { db } from "../firebaseAdmin";
import { verifyToken, AuthedRequest } from "../middleware/verifyToken";

const router = Router();

// Получить / создать свой профиль (вызывается сразу после регистрации)
router.get("/me", verifyToken, async (req: AuthedRequest, res) => {
  const ref = db.collection("users").doc(req.uid!);
  const snap = await ref.get();

  if (!snap.exists) {
    const profile = {
      uid: req.uid,
      email: req.email,
      displayName: req.email?.split("@")[0] || "user",
      avatar: null,
      createdAt: Date.now(),
    };
    await ref.set(profile);
    return res.json(profile);
  }
  res.json(snap.data());
});

// Обновить профиль (имя, аватар)
router.patch("/me", verifyToken, async (req: AuthedRequest, res) => {
  const { displayName, avatar } = req.body;
  const updates: Record<string, unknown> = {};
  if (displayName) updates.displayName = displayName;
  if (avatar !== undefined) updates.avatar = avatar;

  await db.collection("users").doc(req.uid!).set(updates, { merge: true });
  res.json({ ok: true });
});

// Список пользователей (для выбора собеседника в личку)
router.get("/", verifyToken, async (req: AuthedRequest, res) => {
  const snap = await db.collection("users").get();
  const list = snap.docs
    .map((d) => d.data())
    .filter((u) => u.uid !== req.uid);
  res.json(list);
});

export default router;
