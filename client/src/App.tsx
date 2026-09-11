import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { firebaseAuth } from "./firebase";
import AuthScreen from "./AuthScreen";
import ChatScreen from "./ChatScreen";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(firebaseAuth, setUser), []);

  if (user === undefined) return <div className="loading">Загрузка...</div>;
  return user ? <ChatScreen user={user} /> : <AuthScreen />;
}
