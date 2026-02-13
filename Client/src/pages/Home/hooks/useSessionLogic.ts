import { useState, useEffect, useRef, useCallback } from "react";
import debounce from "lodash.debounce";
import ChatClient from "../../../services/core/ChatClient";
import { queryDB, executeDB } from "../../../services/storage/sqliteService";
import { SessionData, InboundReq } from "../types";

export const useSessionLogic = () => {
  const [view, setView] = useState<"chat" | "add" | "welcome">("welcome");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [inboundReq, setInboundReq] = useState<InboundReq | null>(null);
  const [error] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notification, setNotification] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  const loadSessions = useCallback(
    debounce(async () => {
      if (!ChatClient.userEmail) return;

      const rows = await queryDB(`
      SELECT s.sid, s.alias_name, s.alias_avatar, s.peer_name, s.peer_avatar, s.peer_email,
             (SELECT text FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastMsg,
             (SELECT type FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastMsgType,
             (SELECT timestamp FROM messages WHERE sid = s.sid ORDER BY timestamp DESC LIMIT 1) as lastTs,
             (SELECT COUNT(*) FROM messages WHERE sid = s.sid AND is_read = 0 AND sender != 'me') as unread
      FROM sessions s
      ORDER BY lastTs DESC
    `);

      const formatted: SessionData[] = rows.map((r: any) => ({
        sid: r.sid,
        alias_name: r.alias_name,
        alias_avatar: r.alias_avatar,
        peer_name: r.peer_name,
        peer_avatar: r.peer_avatar,
        peerEmail: r.peer_email,
        lastMsg: r.lastMsg || "",
        lastMsgType: r.lastMsgType || "text",
        lastTs: r.lastTs || 0,
        unread: r.sid === activeChatRef.current ? 0 : r.unread || 0,
        online: ChatClient.sessions[r.sid]?.online || false,
      }));
      setSessions(formatted);
    }, 500),
    [],
  );

  useEffect(() => {
    if (activeChat) {
      executeDB(
        "UPDATE messages SET is_read = 1 WHERE sid = ? AND sender != 'me'",
        [activeChat],
      ).then(() => loadSessions());
      if (ChatClient.sessions[activeChat]) {
        setPeerOnline(ChatClient.sessions[activeChat].online);
      }
    } else {
      setPeerOnline(false);
    }
  }, [activeChat, loadSessions]);

  useEffect(() => {
    const client = ChatClient;
    client
      .init()
      .then(() => {
        if (!client.hasToken()) {
          setIsLoading(false);
        } else {
          setTimeout(() => {
            if (!client.userEmail) setIsLoading(false);
          }, 5000);
        }
      })
      .catch((err) => {
        console.error("Failed to init ChatClient", err);
        setIsLoading(false);
      });

    const onSessionUpdate = () => {
      if (activeChatRef.current) {
        executeDB(
          "UPDATE messages SET is_read = 1 WHERE sid = ? AND sender != 'me'",
          [activeChatRef.current],
        ).catch((e) => console.warn("Failed to mark active chat as read", e));
      }
      loadSessions();
      if (activeChatRef.current && client.sessions[activeChatRef.current]) {
        setPeerOnline(client.sessions[activeChatRef.current].online);
      }
    };

    const onWaitingForAccept = () => {
      setIsJoining(false);
      setIsWaiting(true);
    };

    const onJoinedSuccess = () => {
      setIsWaiting(false);
      setIsJoining(false);
      loadSessions();
    };

    const onSessionCreated = () => {
      loadSessions();
    };

    const onInboundRequest = (req: InboundReq) => setInboundReq(req);

    const onAuthSuccess = (email: string) => {
      setUserEmail(email);
      setIsLoading(false);
      loadSessions();
    };

    const onAuthError = () => {
      setUserEmail(null);
      setIsLoading(false);
      window.location.href = "/login";
    };

    const onNotification = (notif: { type: string; message: string }) => {
      setNotification(notif);
      setTimeout(() => setNotification(null), 3000);
    };

    client.on("session_updated", onSessionUpdate);
    client.on("waiting_for_accept", onWaitingForAccept);
    client.on("joined_success", onJoinedSuccess);
    client.on("session_created", onSessionCreated);
    client.on("inbound_request", onInboundRequest);
    client.on("auth_success", onAuthSuccess);
    client.on("auth_error", onAuthError);
    client.on("notification", onNotification);

    return () => {
      client.off("session_updated", onSessionUpdate);
      client.off("waiting_for_accept", onWaitingForAccept);
      client.off("joined_success", onJoinedSuccess);
      client.off("session_created", onSessionCreated);
      client.off("inbound_request", onInboundRequest);
      client.off("auth_success", onAuthSuccess);
      client.off("auth_error", onAuthError);
      client.off("notification", onNotification);
    };
  }, [loadSessions]);

  const handleConnect = async () => {
    if (!targetEmail) return;
    setIsJoining(true);
    try {
      await ChatClient.connectToPeer(targetEmail);
      setIsJoining(false);
      setNotification({ type: "success", message: "Connection request sent" });
      setTargetEmail("");
    } catch (e) {
      console.error(e);
      setIsJoining(false);
      setNotification({ type: "error", message: "Failed to send request" });
    }
  };

  const handleSetAlias = async (sid: string, name: string) => {
    try {
      await executeDB("UPDATE sessions SET alias_name = ? WHERE sid = ?", [
        name,
        sid,
      ]);
      loadSessions();
    } catch (e) {
      console.error("Failed to set alias", e);
    }
  };

  const clearNotification = () => setNotification(null);

  return {
    state: {
      view,
      activeChat,
      sessions,
      isJoining,
      targetEmail,
      isWaiting,
      inboundReq,
      error,
      peerOnline,
      isSidebarOpen,
      notification,
      userEmail,
      isLoading,
    },
    refs: {
      activeChatRef,
    },
    actions: {
      setView,
      setActiveChat,
      setTargetEmail,
      setIsSidebarOpen,
      setInboundReq,
      setIsWaiting,
      handleConnect,
      handleSetAlias,
      clearNotification,
      loadSessions,
      login: (token: string) => ChatClient.login(token),
    },
  };
};
