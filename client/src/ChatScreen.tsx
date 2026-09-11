import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { signOut, User } from "firebase/auth";
import { firebaseAuth } from "./firebase";
import { api } from "./api";

interface Message {
  id: string;
  from: string;
  fromName: string;
  text: string;
  ts: number;
}
interface Profile {
  uid: string;
  email: string;
  displayName: string;
  avatar: string | null;
}

const API_URL = import.meta.env.VITE_API_URL as string;

export default function ChatScreen({ user }: { user: User }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [activeChat, setActiveChat] = useState<"general" | string>("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [dmCache, setDmCache] = useState<Record<string, Message[]>>({});
  const [text, setText] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Инициализация: профиль, список пользователей, сокет
  useEffect(() => {
    let s: Socket;
    (async () => {
      const token = await user.getIdToken();
      const profile = await api.getMe(token);
      setMe(profile);
      setNameInput(profile.displayName);
      setUsers(await api.listUsers(token));

      s = io(API_URL, { auth: { token } });
      setSocket(s);

      s.on("message:general", (msg: Message) => {
        setMessages((prev) => (activeChatRef.current === "general" ? [...prev, msg] : prev));
      });
      s.on("message:dm", (msg: Message & { to: string }) => {
        const partner = msg.from === profile.uid ? msg.to : msg.from;
        setDmCache((prev) => ({ ...prev, [partner]: [...(prev[partner] || []), msg] }));
        if (activeChatRef.current === partner) {
          setMessages((prev) => [...prev, msg]);
        }
      });

      s.emit("history:general", (history: Message[]) => setMessages(history));
    })();

    return () => {
      s?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Храним активный чат в ref, чтобы обработчики сокета видели актуальное значение
  const activeChatRef = useRef(activeChat);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function openChat(chatId: "general" | string) {
    setActiveChat(chatId);
    if (chatId === "general") {
      socket?.emit("history:general", (h: Message[]) => setMessages(h));
    } else if (dmCache[chatId]) {
      setMessages(dmCache[chatId]);
    } else {
      socket?.emit("history:dm", chatId, (h: Message[]) => {
        setDmCache((prev) => ({ ...prev, [chatId]: h }));
        setMessages(h);
      });
    }
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    if (activeChat === "general") {
      socket.emit("message:general", text);
    } else {
      socket.emit("message:dm", { to: activeChat, text });
    }
    setText("");
  }

  async function saveName() {
    const token = await user.getIdToken();
    await api.updateMe(token, { displayName: nameInput });
    setMe((prev) => (prev ? { ...prev, displayName: nameInput } : prev));
    setEditingName(false);
  }

  const partnerName = (uid: string) => users.find((u) => u.uid === uid)?.displayName || uid;

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="profile-box">
          {editingName ? (
            <div className="edit-name">
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
              <button onClick={saveName}>✓</button>
            </div>
          ) : (
            <div className="profile-name" onClick={() => setEditingName(true)}>
              {me?.displayName} <span className="edit-hint">✎</span>
            </div>
          )}
          <button className="logout" onClick={() => signOut(firebaseAuth)}>
            Выйти
          </button>
        </div>

        <div className={`chat-item ${activeChat === "general" ? "active" : ""}`} onClick={() => openChat("general")}>
          # Общий чат
        </div>

        <div className="chat-item-header">Личные сообщения</div>
        {users.map((u) => (
          <div
            key={u.uid}
            className={`chat-item ${activeChat === u.uid ? "active" : ""}`}
            onClick={() => openChat(u.uid)}
          >
            {u.displayName}
          </div>
        ))}
      </aside>

      <main className="chat-main">
        <header>{activeChat === "general" ? "Общий чат" : partnerName(activeChat)}</header>
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`message ${m.from === me?.uid ? "own" : ""}`}>
              <span className="author">{m.fromName}</span>
              <span className="text">{m.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Написать сообщение..."
          />
          <button type="submit">Отправить</button>
        </form>
      </main>
    </div>
  );
}
