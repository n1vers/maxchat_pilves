import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Значения из Firebase Console -> Project settings -> General -> Your apps (Web app)
// Это публичные ключи, их можно хранить прямо в клиентском коде.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
