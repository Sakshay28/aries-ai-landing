"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Conversation {
  id: string;
  sender_id: string;
  sender_name: string;
  is_active: boolean;
  bot_paused: boolean;
  message_count: number;
  last_message_at: string;
  current_step: string;
  escalated: boolean;
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  created_at: string;
  message_type?: string;
}

function timeStr(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function dateStr(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [search, setSearch] = useState("");
  const [takingOver, setTakingOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find(c => c.id === selectedId);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/conversations?limit=100");
      const d = await res.json();
      if (d.success) setConversations(d.data || []);
    } finally { setLoadingConvs(false); }
  }, []);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/dashboard/conversations/${convId}/messages`);
      const d = await res.json();
      if (d.success) setMessages(d.data || []);
      else setMessages([]);
    } catch { setMessages([]); }
    finally { setLoadingMsgs(false); }
  }, []);

  useEffect(() => {
    void (async () => { await loadConversations(); })();
    const t = setInterval(() => { void (async () => { await loadConversations(); })(); }, 15000);
    return () => clearInterval(t);
  }, [loadConversations]);
  useEffect(() => { if (selectedId) void (async () => { await loadMessages(selectedId); })(); }, [selectedId, loadMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const toggleBot = async (conv: Conversation) => {
    setTakingOver(true);
    try {
      await fetch(`/api/dashboard/conversations/${conv.id}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_paused: !conv.bot_paused }),
      });
      setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, bot_paused: !c.bot_paused } : c));
    } finally { setTakingOver(false); }
  };

  const filtered = conversations.filter(c =>
    (c.sender_name || c.sender_id).toLowerCase().includes(search.toLowerCase())
  );

  // Group messages by date
  const grouped: { date: string; messages: Message[] }[] = [];
  messages.forEach(m => {
    const d = dateStr(m.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.date === d) last.messages.push(m);
    else grouped.push({ date: d, messages: [m] });
  });

  return (
    <div style={{ display: "flex", height: "calc(100vh - 145px)", background: "white", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>

      {/* ── Left: Conversation List ── */}
      <div style={{ width: 320, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {/* Header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 10 }}>Conversations</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f3f4f6", borderRadius: 10, padding: "8px 12px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..." style={{ border: "none", background: "none", outline: "none", fontSize: 13, color: "#374151", width: "100%", fontFamily: "inherit" }} />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingConvs ? (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 13 }}>No conversations yet</div>
            </div>
          ) : filtered.map(conv => {
            const name = conv.sender_name || conv.sender_id;
            const isSelected = conv.id === selectedId;
            const initial = name.charAt(0).toUpperCase();
            return (
              <div key={conv.id} onClick={() => setSelectedId(conv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  cursor: "pointer", background: isSelected ? "#f0fdf4" : "white",
                  borderBottom: "1px solid #f9fafb", transition: "background 150ms",
                  borderLeft: isSelected ? "3px solid #25D366" : "3px solid transparent",
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#fafbfc"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "white"; }}>
                {/* Avatar */}
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e9f7ef", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#25D366", flexShrink: 0, position: "relative" }}>
                  {initial}
                  <span style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, borderRadius: "50%", background: conv.is_active ? "#22c55e" : "#d1d5db", border: "2px solid white" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, marginLeft: 4 }}>{new Date(conv.last_message_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {conv.current_step || "Chatting..."}
                    </span>
                    {conv.bot_paused && <span style={{ fontSize: 10, fontWeight: 700, background: "#fffbeb", color: "#d97706", padding: "1px 6px", borderRadius: 100, flexShrink: 0 }}>Paused</span>}
                    {conv.escalated && <span style={{ fontSize: 10, fontWeight: 700, background: "#fef2f2", color: "#dc2626", padding: "1px 6px", borderRadius: 100, flexShrink: 0 }}>!</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Chat View ── */}
      {!selectedId ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9ca3af", background: "#f9fafb" }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#6b7280" }}>Select a conversation</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>Click any contact to view the chat</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f9fafb" }}>
          {/* Chat Header */}
          <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#e9f7ef", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#25D366" }}>
                {(selected?.sender_name || selected?.sender_id || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{selected?.sender_name || selected?.sender_id}</div>
                <div style={{ fontSize: 12, color: selected?.is_active ? "#22c55e" : "#9ca3af" }}>
                  {selected?.is_active ? "● Online" : "Last seen recently"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {selected?.bot_paused ? (
                <button onClick={() => selected && toggleBot(selected)} disabled={takingOver}
                  style={{ padding: "7px 16px", background: "#25D366", color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  ▶ Resume Bot
                </button>
              ) : (
                <button onClick={() => selected && toggleBot(selected)} disabled={takingOver}
                  style={{ padding: "7px 16px", background: "white", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Take Over Chat
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 20px",
            backgroundImage: "radial-gradient(circle at 1px 1px, #e5e7eb 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}>
            {loadingMsgs ? (
              <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 40 }}>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 40, fontSize: 13 }}>No messages yet</div>
            ) : grouped.map(group => (
              <div key={group.date}>
                {/* Date separator */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "16px 0 12px" }}>
                  <span style={{ background: "#e9ecef", color: "#6b7280", fontSize: 12, fontWeight: 600, padding: "3px 14px", borderRadius: 100 }}>{group.date}</span>
                </div>
                {group.messages.map(msg => {
                  const isOut = msg.direction === "outbound";
                  return (
                    <div key={msg.id} style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start", marginBottom: 6 }}>
                      <div style={{
                        maxWidth: "68%", padding: "9px 13px",
                        background: isOut ? "#25D366" : "white",
                        color: isOut ? "white" : "#111827",
                        borderRadius: isOut ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                        fontSize: 14, lineHeight: 1.5,
                      }}>
                        <div>{msg.content}</div>
                        <div style={{ fontSize: 11, color: isOut ? "rgba(255,255,255,0.7)" : "#9ca3af", textAlign: "right", marginTop: 4 }}>
                          {timeStr(msg.created_at)}
                          {isOut && <span style={{ marginLeft: 4 }}>✓✓</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div style={{ background: "white", borderTop: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            {selected?.bot_paused ? (
              <>
                <input disabled placeholder="Bot is paused — you can reply manually here" style={{ flex: 1, background: "#fafbfc", border: "1px solid #e5e7eb", borderRadius: 22, padding: "10px 16px", fontSize: 14, outline: "none", color: "#9ca3af", fontFamily: "inherit" }} />
                <button disabled style={{ width: 40, height: 40, borderRadius: "50%", background: "#25D366", border: "none", cursor: "not-allowed", opacity: 0.5, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#f3f4f6", borderRadius: 22, padding: "10px 16px", fontSize: 13, color: "#9ca3af" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                AI Bot is active — click &quot;Take Over&quot; to reply manually
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
