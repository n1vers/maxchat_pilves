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
  replyTo?: { id: string; fromName: string; text: string } | null;
}
interface Profile {
  uid: string;
  email: string;
  displayName: string;
  avatar: string | null;
}

type Theme = "midnight" | "ocean" | "forest" | "light";
const API_URL = (import.meta.env.VITE_API_URL as string) || undefined;
const emojis = ["😀", "😂", "😍", "😎", "😭", "😡", "🤔", "👍", "👎", "❤️", "🔥", "🎉", "💀", "🙏", "🚀", "💻", "👀", "✨"];

export default function ChatScreen({ user }: { user: User }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [activeChat, setActiveChat] = useState<"general" | string>("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [dmCache, setDmCache] = useState<Record<string, Message[]>>({});
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("maxchat-theme") as Theme) || "midnight");
  const [nameInput, setNameInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeChatRef = useRef(activeChat);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { localStorage.setItem("maxchat-theme", theme); }, [theme]);

  useEffect(() => {
    let s: Socket;
    (async () => {
      const token = await user.getIdToken();
      const profile = await api.getMe(token) as Profile;
      setMe(profile); setNameInput(profile.displayName); setAvatarInput(profile.avatar || "");
      setUsers(await api.listUsers(token) as Profile[]);
      s = io(API_URL, { auth: { token } });
      setSocket(s);
      s.on("message:general", (msg: Message) => {
        if (activeChatRef.current === "general") setMessages((prev) => [...prev, msg]);
      });
      s.on("message:dm", (msg: Message & { to: string }) => {
        const partner = msg.from === profile.uid ? msg.to : msg.from;
        setDmCache((prev) => ({ ...prev, [partner]: [...(prev[partner] || []), msg] }));
        if (activeChatRef.current === partner) setMessages((prev) => [...prev, msg]);
      });
      s.emit("history:general", (history: Message[]) => setMessages(history));
    })();
    return () => {
      s?.disconnect();
    };
  }, [user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function openChat(chatId: "general" | string) {
    setActiveChat(chatId); setReplyTo(null); setShowEmoji(false);
    if (chatId === "general") socket?.emit("history:general", (h: Message[]) => setMessages(h));
    else if (dmCache[chatId]) setMessages(dmCache[chatId]);
    else socket?.emit("history:dm", chatId, (h: Message[]) => { setDmCache((p) => ({ ...p, [chatId]: h })); setMessages(h); });
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    const payload = { text: text.trim(), replyTo: replyTo ? { id: replyTo.id, fromName: replyTo.fromName, text: replyTo.text } : null };
    if (activeChat === "general") socket.emit("message:general", payload); else socket.emit("message:dm", { to: activeChat, ...payload });
    setText(""); setReplyTo(null); setShowEmoji(false);
  }

  async function saveProfile() {
    const token = await user.getIdToken();
    const displayName = nameInput.trim() || me?.displayName || "user";
    const avatar = avatarInput.trim() || undefined;
    await api.updateMe(token, { displayName, avatar });
    socket?.emit("profile:update", displayName);
    const updated = { ...(me as Profile), displayName, avatar: avatar ?? null };
    setMe(updated); setUsers((list) => list.map((u) => u.uid === updated.uid ? updated : u));
    setShowProfile(false);
  }

  const partnerName = (uid: string) => users.find((u) => u.uid === uid)?.displayName || uid;
  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`chat-layout theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand"><span>💬</span> MaxChat</div>
        <div className="profile-card">
          <div className="avatar">{me?.avatar ? <img src={me.avatar} alt="avatar" /> : (me?.displayName?.[0] || "?").toUpperCase()}</div>
          <div className="profile-info"><b>{me?.displayName}</b><small>online</small></div>
          <button className="icon-btn" title="Профиль" onClick={() => setShowProfile(true)}>⚙️</button>
        </div>
        <div className={`chat-item ${activeChat === "general" ? "active" : ""}`} onClick={() => openChat("general")}><span>🌐</span># Общий чат</div>
        <div className="chat-item-header">Личные сообщения</div>
        {users.map((u) => <div key={u.uid} className={`chat-item ${activeChat === u.uid ? "active" : ""}`} onClick={() => openChat(u.uid)}><span className="mini-avatar">{u.avatar ? <img src={u.avatar} alt="" /> : u.displayName[0]?.toUpperCase()}</span>{u.displayName}</div>)}
        <div className="sidebar-bottom"><button onClick={() => setShowThemes(!showThemes)}>🎨 Тема</button><button onClick={() => signOut(firebaseAuth)}>↪ Выйти</button>{showThemes && <div className="theme-menu">{(["midnight", "ocean", "forest", "light"] as Theme[]).map((t) => <button key={t} className={theme === t ? "selected" : ""} onClick={() => { setTheme(t); setShowThemes(false); }}>{t === "midnight" ? "🌙 Тёмная" : t === "ocean" ? "🌊 Ocean" : t === "forest" ? "🌲 Forest" : "☀️ Светлая"}</button>)}</div>}</div>
      </aside>

      <main className="chat-main">
        <header className="chat-header"><div><strong>{activeChat === "general" ? "Общий чат" : partnerName(activeChat)}</strong><small>{activeChat === "general" ? "Все участники" : "Личная переписка"}</small></div><span className="header-status">● online</span></header>
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`message-row ${m.from === me?.uid ? "own" : ""}`}>
              <div className="message">
                {m.replyTo && <div className="reply-preview"><b>{m.replyTo.fromName}</b><span>{m.replyTo.text}</span></div>}
                <div className="message-meta"><span className="author">{m.fromName}</span><span className="time">{formatTime(m.ts)}</span></div>
                <span className="text">{m.text}</span>
                <button className="reply-btn" title="Ответить" onClick={() => setReplyTo(m)}>↩</button>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {replyTo && <div className="reply-bar"><div><b>Ответ {replyTo.fromName}</b><span>{replyTo.text}</span></div><button onClick={() => setReplyTo(null)}>×</button></div>}
        <form className="composer" onSubmit={sendMessage}>
          <div className="emoji-wrap"><button type="button" className="emoji-btn" onClick={() => setShowEmoji(!showEmoji)}>😊</button>{showEmoji && <div className="emoji-picker">{emojis.map((e) => <button type="button" key={e} onClick={() => setText((v) => v + e)}>{e}</button>)}</div>}</div>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Написать сообщение..." />
          <button className="send-btn" type="submit">➤</button>
        </form>
      </main>

      {showProfile && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowProfile(false)}><div className="modal"><div className="modal-head"><h2>Профиль</h2><button onClick={() => setShowProfile(false)}>×</button></div><div className="profile-edit-avatar">{avatarInput ? <img src={avatarInput} alt="avatar" /> : (nameInput[0] || "?").toUpperCase()}</div><label>Никнейм<input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={30} /></label><label>URL аватара<input value={avatarInput} onChange={(e) => setAvatarInput(e.target.value)} placeholder="https://..." /></label><label>Email<input value={me?.email || ""} disabled /></label><button className="save-btn" onClick={saveProfile}>Сохранить профиль</button></div></div>}
    </div>
  );
}
