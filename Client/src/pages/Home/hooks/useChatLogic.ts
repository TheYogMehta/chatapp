import { useState, useEffect, useRef, useCallback } from "react";
import debounce from "lodash.debounce";
import ChatClient from "../../../services/ChatClient";
import { queryDB, executeDB } from "../../../services/sqliteService";
import { SessionData, ChatMessage, InboundReq } from "../types";

export const useChatLogic = () => {
  const [view, setView] = useState<"chat" | "add" | "welcome">("welcome");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  const [isWaiting, setIsWaiting] = useState(false);
  const [inboundReq, setInboundReq] = useState<InboundReq | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notification, setNotification] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [offset, setOffset] = useState(0);

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  useEffect(() => {
    if (activeChat) {
      loadHistory(activeChat, true);
      executeDB(
        "UPDATE messages SET is_read = 1 WHERE sid = ? AND sender != 'me'",
        [activeChat],
      ).then(() => loadSessions());
      if (ChatClient.sessions[activeChat]) {
        setPeerOnline(ChatClient.sessions[activeChat].online);
      }
    } else {
      setMessages([]);
      setPeerOnline(false);
    }
  }, [activeChat]);

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
        unread: r.unread || 0,
        online: ChatClient.sessions[r.sid]?.online || false,
      }));
      setSessions(formatted);
    }, 500),
    [],
  );

  const loadHistory = async (sid: string, reset: boolean = false) => {
    const limit = 50;
    const currentOffset = reset ? 0 : offset;
    const rows = await queryDB(
      `SELECT m.*, 
              md.status as mediaStatus, 
              md.filename as mediaFilename, 
              md.file_size as mediaTotalSize, 
              md.size as mediaCurrentSize,
              md.download_progress as mediaProgress,
              md.mime_type as mediaMime,
              md.thumbnail
       FROM messages m
       LEFT JOIN media md ON m.id = md.message_id
       WHERE m.sid = ? 
       ORDER BY m.timestamp DESC 
       LIMIT 30`,
      [sid],
    );
    const formatted = rows.map((r: any) => ({
      ...r,
      replyTo: r.reply_to ? JSON.parse(r.reply_to) : undefined,
    }));
    setMessages(formatted.reverse());
  };

  const loadMoreHistory = () => {
    if (activeChatRef.current) {
      loadHistory(activeChatRef.current, false);
    }
  };

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
      loadSessions();
      if (activeChatRef.current && client.sessions[activeChatRef.current]) {
        setPeerOnline(client.sessions[activeChatRef.current].online);
      }
    };

    const onMsg = async (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        setMessages((prev) => [...prev, msg]);
        await executeDB("UPDATE messages SET is_read = 1 WHERE id = ?", [
          msg.id,
        ]);
      }
      loadSessions();
    };

    const onDownloadProgress = ({ messageId, progress }: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, mediaProgress: progress, mediaStatus: "downloading" }
            : m,
        ),
      );
    };

    const onFileDownloaded = ({ messageId }: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, mediaStatus: "downloaded", mediaProgress: 1 }
            : m,
        ),
      );
    };

    const onRemoteStream = (videoEl: HTMLVideoElement) => {
      setActiveCall((prev: any) =>
        prev ? { ...prev, remoteVideo: videoEl } : null,
      );
    };

    const onLocalStream = (stream: MediaStream | null) => {
      setLocalStream(stream);
    };

    client.on("session_updated", onSessionUpdate);
    client.on("local_stream_ready", onLocalStream);
    client.on("message", onMsg);
    client.on("download_progress", onDownloadProgress);
    client.on("file_downloaded", onFileDownloaded);
    client.on("waiting_for_accept", () => {
      setIsJoining(false);
      setIsWaiting(true);
    });
    client.on("joined_success", (sid) => {
      setIsWaiting(false);
      setIsJoining(false);
    });
    client.on("inbound_request", (req) => setInboundReq(req));
    client.on("auth_success", (email) => {
      setUserEmail(email);
      setIsLoading(false);
    });
    client.on("auth_error", () => {
      setUserEmail(null);
      setIsLoading(false);
    });
    const getSessionInfo = async (sid: string) => {
      try {
        const rows = await queryDB(
          "SELECT alias_name, alias_avatar, peer_name, peer_avatar, peer_email FROM sessions WHERE sid = ?",
          [sid],
        );
        if (rows.length > 0) {
          const r = rows[0];
          return {
            peerName: r.alias_name || r.peer_name || r.peer_email || "Unknown",
            peerAvatar: r.alias_avatar || r.peer_avatar,
          };
        }
      } catch (e) {
        console.error("Failed to load session info for call", e);
      }
      return { peerName: "Unknown", peerAvatar: null };
    };

    client.on("call_incoming", async (call) => {
      const info = await getSessionInfo(call.sid);
      setActiveCall({ ...call, ...info, status: "ringing" });
    });

    client.on("call_outgoing", async (call) => {
      const info = await getSessionInfo(call.sid);
      setActiveCall({ ...call, ...info, status: "outgoing" });
    });

    loadSessions();
    client.on("call_started", () =>
      setActiveCall((prev: any) =>
        prev ? { ...prev, status: "connected" } : null,
      ),
    );
    client.on("ice_status", (status) =>
      setActiveCall((prev: any) =>
        prev ? { ...prev, iceStatus: status } : null,
      ),
    );
    client.on("call_mode_changed", ({ sid, mode }) => {
      setActiveCall((prev: any) =>
        prev && prev.sid === sid ? { ...prev, type: mode } : prev,
      );
    });
    client.on("remote_stream_ready", onRemoteStream);
    client.on("call_ended", async (data: any) => {
      setActiveCall(null);
      const sid = typeof data === "string" ? data : data.sid;
      const duration = typeof data === "object" ? data.duration : 0;
      const connected = typeof data === "object" ? !!data.connected : false;

      let text = "";
      if (connected) {
        const min = Math.floor(duration / 60000);
        const sec = Math.floor((duration % 60000) / 1000);
        const durationStr = `${min}m ${sec}s`;
        text = `Call ended • ${durationStr}`;
      } else {
        text = "Missed Call";
      }

      const id = crypto.randomUUID();
      const timestamp = Date.now();

      try {
        await executeDB(
          "INSERT INTO messages (id, sid, sender, text, type, timestamp, status) VALUES (?, ?, 'system', ?, 'system', ?, 1)",
          [id, sid, text, timestamp],
        );

        if (activeChatRef.current === sid) {
          setMessages((prev) => [
            ...prev,
            {
              id,
              sid,
              text,
              sender: "system",
              type: "system",
              timestamp,
              status: 1,
            },
          ]);
        }
        loadSessions();
      } catch (e) {
        console.error("Failed to log call end:", e);
      }
    });
    client.on("message_status", ({ sid }) => {
      if (sid === activeChatRef.current) {
        loadHistory(sid);
      }
    });

    client.on("notification", (notif) => {
      setNotification(notif);
      setTimeout(() => setNotification(null), 3000);
    });

    return () => {
      client.off("session_updated", onSessionUpdate);
      client.off("message", onMsg);
      client.off("file_downloaded", onFileDownloaded);
      client.off("auth_success", () => {});
      client.off("remote_stream_ready", onRemoteStream);
    };
  }, []);

  const handleSend = async (text: string) => {
    if (!text.trim() || !activeChat) return;
    const currentInput = text;
    const currentReplyTo = replyingTo;

    setReplyingTo(null);

    const replyContext =
      currentReplyTo && currentReplyTo.id
        ? {
            id: currentReplyTo.id,
            text: currentReplyTo.text,
            sender:
              currentReplyTo.sender === "me"
                ? "Me"
                : currentReplyTo.sender || "Other",
            type: currentReplyTo.type,
            mediaFilename: currentReplyTo.mediaFilename,
            thumbnail: currentReplyTo.thumbnail,
          }
        : undefined;

    await ChatClient.sendMessage(activeChat, currentInput, replyContext);

    const newMsg: ChatMessage = {
      sid: activeChat,
      text: currentInput,
      sender: "me",
      timestamp: Date.now(),
      type: "text",
      status: 1,
      replyTo: replyContext,
    };

    setMessages((prev) => [...prev, newMsg]);
    loadSessions();
  };

  const handleFile = async (file: File) => {
    if (!activeChat) return;

    const tempId = crypto.randomUUID();
    const tempMsg: ChatMessage = {
      id: tempId,
      sid: activeChat,
      sender: "me",
      text: file.name,
      type: file.type.startsWith("image")
        ? "image"
        : file.type.startsWith("video")
        ? "video"
        : "file",
      timestamp: Date.now(),
      mediaTotalSize: file.size,
      tempUrl: URL.createObjectURL(file),
      mediaStatus: "uploading",
      status: 1,
    };

    setMessages((prev) => [...prev, tempMsg]);

    ChatClient.sendFile(activeChat, file, {
      name: file.name,
      size: file.size,
      type: file.type,
    }).catch((err) => {
      console.error("Failed to send file", err);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 3 } : m)),
      );
    });
    loadSessions();
  };

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

  const [isRateLimited, setIsRateLimited] = useState(false);

  useEffect(() => {
    const handleRateLimit = () => {
      setIsRateLimited(true);
      setTimeout(() => setIsRateLimited(false), 1000);
      setNotification({ type: "error", message: "You are sending too fast!" });
    };

    const client = ChatClient;
    client.on("rate_limit_exceeded", handleRateLimit);
    return () => {
      client.off("rate_limit_exceeded", handleRateLimit);
    };
  }, []);

  return {
    state: {
      view,
      activeChat,
      activeCall,
      messages,
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
      replyingTo,
      localStream,
      isRateLimited,
    },
    actions: {
      login: (token: string) => ChatClient.login(token),
      setView,
      setActiveChat,
      setReplyingTo,
      setTargetEmail,
      setIsSidebarOpen,
      setInboundReq,
      setIsWaiting,
      handleSend,
      handleFile,
      handleConnect,
      startCall: (type: any) => ChatClient.startCall(activeChat!, type),
      switchStream: (mode: any) =>
        ChatClient.switchStream(activeCall.sid, mode),
      acceptCall: () => ChatClient.acceptCall(activeCall.sid),
      rejectCall: () => {
        if (activeCall) ChatClient.endCall(activeCall.sid);
      },
      endCall: () => {
        if (activeCall) ChatClient.endCall(activeCall.sid);
        else ChatClient.endCall(); // Try to end current call even if state is lost
      },
      clearNotification: () => setNotification(null),
      loadMoreHistory,
      handleSetAlias: async (sid: string, name: string) => {
        try {
          await executeDB("UPDATE sessions SET alias_name = ? WHERE sid = ?", [
            name,
            sid,
          ]);
          loadSessions();
        } catch (e) {
          console.error("Failed to set alias", e);
        }
      },
    },
  };
};
