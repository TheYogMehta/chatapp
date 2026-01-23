import { useState, useEffect, useRef } from "react";
import ChatClient from "../../../services/ChatClient";
import { queryDB } from "../../../services/sqliteService";
import { ChatMessage, InboundReq } from "../types";

export const useChatLogic = () => {
  const [view, setView] = useState<"chat" | "add">("chat");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [inboundReq, setInboundReq] = useState<InboundReq | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<any>(null);

  const activeChatRef = useRef<string | null>(null);
  activeChatRef.current = activeChat;
 
  useEffect(() => {
    if (activeChat) {
      loadHistory(activeChat);
    } else {
      setMessages([]);
    }
  }, [activeChat]);

  const loadHistory = async (sid: string) => {
    const rows = await queryDB(
      `SELECT m.*, 
              md.status as mediaStatus, 
              md.filename as mediaFilename, 
              md.file_size as mediaTotalSize, 
              md.size as mediaCurrentSize,
              md.download_progress as mediaProgress
       FROM messages m
       LEFT JOIN media md ON m.id = md.message_id
       WHERE m.sid = ? 
       ORDER BY m.timestamp ASC`,
      [sid]
    );
    setMessages(rows as any);
  };

  useEffect(() => {
    const client = ChatClient;
    client.init().catch((err) => console.error("Failed to init ChatClient", err));

    const onSessionUpdate = () => setSessions(Object.keys(client.sessions));
    const onMsg = (msg: ChatMessage) => {
      if (msg.sid === activeChatRef.current) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    const onDownloadProgress = ({ messageId, progress }: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m.id === messageId) ? { ...m, mediaProgress: progress, mediaStatus: "downloading" } : m
        )
      );
    };

    const onFileDownloaded = ({ messageId }: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m.id === messageId) ? { ...m, mediaStatus: "downloaded", mediaProgress: 1 } : m
        )
      );
    };

    // Original listeners
    client.on("session_updated", onSessionUpdate);
    client.on("message", onMsg);
    client.on("download_progress", onDownloadProgress);
    client.on("file_downloaded", onFileDownloaded);
    client.on("invite_ready", (code) => {
      setInviteCode(code);
      setIsGenerating(false);
    });
    client.on("waiting_for_accept", () => {
      setIsJoining(false);
      setIsWaiting(true);
    });
    client.on("joined_success", (sid) => {
      setIsWaiting(false);
      setIsJoining(false);
      setInviteCode(null);
    });
    client.on("inbound_request", (req) => setInboundReq(req));
    client.on("call_incoming", (call) =>
      setActiveCall({ ...call, status: "ringing" }),
    );
    client.on("message_status", ({ sid }) => {
      if (sid === activeChatRef.current) {
        loadHistory(sid);
      }
    });

    return () => {
      client.off("session_updated", onSessionUpdate);
      client.off("message", onMsg);
      client.off("download_progress", onDownloadProgress);
      client.off("file_downloaded", onFileDownloaded);
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
        status: 1, // Pending
      },
    ]);
  };

  const handleJoin = async () => {
    if (!joinCode) return;
    setIsJoining(true);
    try {
      await ChatClient.joinByCode(joinCode);
    } catch (e) {
      console.error(e);
      setIsJoining(false);
    }
  };

  return {
    state: {
      view,
      activeChat,
      activeCall,
      messages,
      sessions,
      input,
      inviteCode,
      isGenerating,
      isJoining,
      joinCode,
      isWaiting,
      inboundReq,
      error,
      peerOnline,
      isSidebarOpen,
    },
    actions: {
      setView,
      setActiveChat,
      setInput,
      setJoinCode,
      setIsSidebarOpen,
      setInboundReq,
      setIsWaiting,
      setIsGenerating,
      handleSend,
      handleJoin,
      startCall: (type: any) => ChatClient.startCall(activeChat!, type),
      acceptCall: () => ChatClient.acceptCall(activeCall.sid),
      rejectCall: () => ChatClient.endCall(activeCall.sid),
      endCall: () => ChatClient.endCall(activeCall.sid),
    },
  };
};
