import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamChat, fetchProfileSnapshot, type ProfileSnapshot } from "./api";
import { Composer } from "./components/Composer";
import { Message, type MessageState } from "./components/Message";
import { ProfilePanel } from "./components/ProfilePanel";
import { TopBar } from "./components/TopBar";

// Generate an opaque session id; keep it stable across refreshes in
// localStorage so the profile survives a page reload.
function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = window.localStorage.getItem("pson5-chat-session-id");
  if (existing) return existing;
  const fresh = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem("pson5-chat-session-id", fresh);
  return fresh;
}

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "anon";
  const existing = window.localStorage.getItem("pson5-chat-user-id");
  if (existing) return existing;
  const fresh = `user_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem("pson5-chat-user-id", fresh);
  return fresh;
}

export function App() {
  const sessionId = useMemo(getOrCreateSessionId, []);
  const userId = useMemo(getOrCreateUserId, []);
  const [messages, setMessages] = useState<MessageState[]>([
    {
      id: "seed",
      role: "assistant",
      kind: "text",
      text:
        "Hi. I'm a PSON5-backed assistant. I'll ask you one short, structured question at a time — the panel on the right fills in as you answer. Once we've got a few turns in, ask me to simulate a decision or recall what I know about you. Just say hi to get started."
    }
  ]);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const snap = await fetchProfileSnapshot(sessionId);
      setProfile(snap);
    } catch {
      // non-fatal — the profile panel just won't refresh
    }
  }, [sessionId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const resetSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    window.localStorage.removeItem("pson5-chat-session-id");
    window.localStorage.removeItem("pson5-chat-user-id");
    window.location.reload();
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMessage: MessageState = {
        id: `u_${Date.now()}`,
        role: "user",
        kind: "text",
        text: text.trim()
      };
      const assistantId = `a_${Date.now()}`;
      const pendingAssistant: MessageState = {
        id: assistantId,
        role: "assistant",
        kind: "text",
        text: "",
        streaming: true,
        toolCalls: []
      };
      setMessages((prev) => [...prev, userMessage, pendingAssistant]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of streamChat(
          { session_id: sessionId, user_id: userId, message: text.trim() },
          controller.signal
        )) {
          switch (event.type) {
            case "assistant-delta":
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + event.text } : m))
              );
              break;
            case "tool-start":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls ?? []),
                          { id: event.id, name: event.name, arguments: event.arguments, state: "running" }
                        ]
                      }
                    : m
                )
              );
              break;
            case "tool-end":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls ?? []).map((t) =>
                          t.id === event.id
                            ? {
                                ...t,
                                state: event.error ? "error" : "done",
                                durationMs: event.duration_ms,
                                resultPreview: event.result_preview,
                                error: event.error
                              }
                            : t
                        )
                      }
                    : m
                )
              );
              break;
            case "assistant-end":
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
              );
              break;
            case "error":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, streaming: false, text: m.text + `\n\n[error: ${event.message}]` }
                    : m
                )
              );
              break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false, text: m.text + `\n\n[error: ${message}]` } : m
          )
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        // After every completed turn, refresh the profile view — the agent
        // may have called pson_learn to persist observed facts.
        refreshProfile();
      }
    },
    [isStreaming, refreshProfile, sessionId, userId]
  );

  return (
    <div className="app">
      <TopBar
        profileId={profile?.profile_id ?? null}
        userId={userId}
        revision={profile?.revision ?? null}
        confidence={profile?.confidence ?? null}
        onReset={resetSession}
      />

      <div className="layout">
        <main className="chat" aria-label="Conversation">
          <div className="chat__scroll">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </div>
          <Composer onSend={send} disabled={isStreaming} />
        </main>

        <aside className="side" aria-label="Profile">
          <ProfilePanel profile={profile} />
        </aside>
      </div>
    </div>
  );
}
