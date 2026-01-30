import { useState, useEffect, useRef } from "react";
import ChatClient from "../../../services/ChatClient";
import { queryDB } from "../../../services/sqliteService";
import { ChatMessage, InboundReq } from "../types";

export const useChatLogic = () => {
  const [view, setView] = useState<"chat" | "add" | "welcome">("welcome");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  // const [inviteCode, setInviteCode] = useState<string | null>(null); // Removed
  // const [isGenerating, setIsGenerating] = useState(false); // Removed
  const [isJoining, setIsJoining] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  // const [joinCode, setJoinCode] = useState(""); // Removed in favor of targetEmail

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

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;

  useEffect(() => {
    if (activeChat) {
      loadHistory(activeChat);
      if (ChatClient.sessions[activeChat]) {
        setPeerOnline(ChatClient.sessions[activeChat].online);
      }
    } else {
      setMessages([]);
      setPeerOnline(false);
    }
  }, [activeChat]);

  const loadHistory = async (sid: string) => {
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
       ORDER BY m.timestamp ASC`,
      [sid],
    );
    setMessages(rows as any);
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
      setSessions(Object.keys(client.sessions));
      if (activeChatRef.current && client.sessions[activeChatRef.current]) {
        setPeerOnline(client.sessions[activeChatRef.current].online);
      }
    };
    const onMsg = (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        setMessages((prev) => [...prev, msg]);
      }
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

    client.on("session_updated", onSessionUpdate);
    client.on("message", onMsg);
    client.on("download_progress", onDownloadProgress);
    client.on("file_downloaded", onFileDownloaded);
    // client.on("invite_ready", ...); // Removed
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
    client.on("call_incoming", (call) =>
      setActiveCall({ ...call, status: "ringing" }),
    );
    client.on("call_outgoing", (call) =>
      setActiveCall({ ...call, status: "outgoing" }),
    );
    client.on("call_started", () =>
      setActiveCall((prev: any) => (prev ? { ...prev, status: "connected" } : null)),
    );
    client.on("call_ended", () => setActiveCall(null));
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
      client.off("auth_success", () => { });
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !activeChat) return;
    const currentInput = input;
    setInput("");
    await ChatClient.sendMessage(activeChat, currentInput);
    setMessages((prev) => [
      ...prev,
      {
        sid: activeChat,
        text: currentInput,
        sender: "me",
        timestamp: Date.now(),
        type: "text",
        status: 1,
      },
    ]);
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
      status: 1,
      mediaStatus: "uploading",
      mediaProgress: 0,
      mediaFilename: file.name,
      mediaTotalSize: file.size,
      tempUrl: URL.createObjectURL(file),
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
  };

  const handleConnect = async () => {
    if (!targetEmail) return;
    setIsJoining(true);
    try {
      await ChatClient.connectToPeer(targetEmail);
      setIsJoining(false); // Request sent
      setNotification({ type: 'success', message: 'Connection request sent' });
      setTargetEmail("");
    } catch (e) {
      console.error(e);
      setIsJoining(false);
      setNotification({ type: 'error', message: 'Failed to send request' });
    }
  }

  return {
    state: {
      view,
      activeChat,
      activeCall,
      messages,
      sessions,
      input,
      isJoining,
      targetEmail,
      isWaiting,
      inboundReq,
      error,
      peerOnline,
      isSidebarOpen,
      notification,
      userEmail,
      isLoading
    },
    actions: {
      login: (token: string) => ChatClient.login(token),
      setView,
      setActiveChat,
      setInput,
      setTargetEmail,
      setIsSidebarOpen,
      setInboundReq,
      setIsWaiting,
      handleSend,
      handleFile,
      handleConnect,
      startCall: (type: any) => ChatClient.startCall(activeChat!, type),
      acceptCall: () => ChatClient.acceptCall(activeCall.sid),
      rejectCall: () => ChatClient.endCall(activeCall.sid),
      endCall: () => ChatClient.endCall(activeCall.sid),
    }
  };
};
