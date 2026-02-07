import React, { useEffect, useRef, useState } from "react";
import { styles } from "../../Home.styles";
import { MessageBubble } from "./MessageBubble";
import { PortShareModal } from "./PortShareModal";
import {
  Send,
  Mic,
  Plus,
  Image as ImageIcon,
  Camera,
  FileText,
  MapPin,
  Headphones,
  Globe,
  Phone,
  ArrowLeft,
  X,
  Video,
} from "lucide-react";
import { ChatMessage, SessionData } from "../../types";
import UserAvatar from "../../../../components/UserAvatar";

interface ChatWindowProps {
  messages: ChatMessage[];
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  activeChat: string | null;
  session?: SessionData;
  onFileSelect: (file: File) => void;
  onStartCall: (mode: "Audio" | "Video") => void;
  peerOnline?: boolean;
  onBack?: () => void;
  replyingTo?: ChatMessage | null;
  setReplyingTo?: (msg: ChatMessage | null) => void;
}

export const ChatWindow = ({
  messages,
  input,
  setInput,
  onSend,
  activeChat,
  session,
  onFileSelect,
  onStartCall,
  peerOnline,
  onBack,
  replyingTo,
  setReplyingTo,
}: ChatWindowProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showMenu, setShowMenu] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const headerName =
    session?.alias_name ||
    session?.peer_name ||
    session?.peerEmail ||
    activeChat ||
    "Chat";
  const avatarToUse = session?.alias_avatar || session?.peer_avatar;

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeChat) {
      const file = e.target.files[0];
      if (onFileSelect) {
        onFileSelect(file);
      }
      setShowMenu(false);
    }
  };

  const attachments = [
    {
      label: "Document",
      icon: <FileText size={24} color="white" />,
      color: "#7f5af0",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      label: "Camera",
      icon: <Camera size={24} color="white" />,
      color: "#ff8906",
    },
    {
      label: "Gallery",
      icon: <ImageIcon size={24} color="white" />,
      color: "#e53170",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      label: "Audio",
      icon: <Headphones size={24} color="white" />,
      color: "#2cb67d",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      label: "Live Share",
      icon: <Globe size={24} color="white" />,
      color: "#3b82f6",
      onClick: () => setShowPortModal(true),
    },
    {
      label: "Location",
      icon: <MapPin size={24} color="white" />,
      color: "#f25f5c",
    },
  ];

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleRecord = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          console.log(`[ChatWindow] Audio chunk: ${event.data.size} bytes`);
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });
          console.log(
            `[ChatWindow] Recording stopped. Total size: ${audioBlob.size} bytes`,
          );
          const audioFile = new File(
            [audioBlob],
            `voice-note-${Date.now()}.webm`,
            { type: "audio/webm" },
          );

          if (onFileSelect) {
            onFileSelect(audioFile);
          }

          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone.");
      }
    } else {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  return (
    <div style={{ ...styles.chatWindow, padding: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          paddingTop: "max(16px, env(safe-area-inset-top))",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          backgroundColor: "#161b22",
          background:
            "linear-gradient(180deg, rgba(22,27,34,1) 0%, rgba(22,27,34,0.95) 100%)",
          backdropFilter: undefined,
          zIndex: 50,
          flexShrink: 0,
          minHeight: "calc(64px + env(safe-area-inset-top))",
          marginBottom: "0",
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              marginRight: "8px",
              padding: "8px",
              marginLeft: "-8px",
              cursor: "pointer",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              transition: "background 0.2s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <ArrowLeft size={24} />
          </button>
        )}

        <UserAvatar
          avatarUrl={avatarToUse}
          name={headerName}
          size={42}
          style={{
            marginRight: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        />
        <div style={{ flex: 1, minWidth: 0, marginRight: "8px" }}>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "white",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: "0.3px",
            }}
          >
            {headerName}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "2px",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: peerOnline ? "#22c55e" : "#6b7280",
                boxShadow: peerOnline ? "0 0 8px #22c55e" : "none",
              }}
            />
            <span
              style={{
                fontSize: "0.85rem",
                color: "rgba(255,255,255,0.7)",
                fontWeight: 500,
              }}
            >
              {peerOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <div style={styles.callButtonsContainer}>
          <button
            onClick={() => onStartCall("Audio")}
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "14px",
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#22c55e",
              transition: "all 0.2s",
            }}
            onMouseDown={(e) =>
              (e.currentTarget.style.transform = "scale(0.95)")
            }
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(34, 197, 94, 0.25)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(34, 197, 94, 0.15)")
            }
          >
            <Phone size={22} />
          </button>
          <button
            onClick={() => onStartCall("Video")}
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "14px",
              backgroundColor: "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#6366f1",
              transition: "all 0.2s",
              marginLeft: "12px",
            }}
            onMouseDown={(e) =>
              (e.currentTarget.style.transform = "scale(0.95)")
            }
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(99, 102, 241, 0.25)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(99, 102, 241, 0.15)")
            }
          >
            <Video size={22} />
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
      <div
        ref={scrollRef}
        style={styles.messageList}
        className="animate-fade-up"
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} onReply={setReplyingTo} />
        ))}
      </div>

      {replyingTo && (
        <div
          style={{
            margin: "0 16px 8px 16px",
            padding: "12px",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: "12px",
            borderLeft: "4px solid #6366f1",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            position: "relative",
            animation: "slideUp 0.2s ease-out",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.8rem",
                color: "#6366f1",
                fontWeight: "bold",
                marginBottom: "2px",
              }}
            >
              Replying to {replyingTo.sender === "me" ? "Me" : "Other"}
            </div>
            <div
              style={{
                fontSize: "0.9rem",
                color: "rgba(255,255,255,0.7)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {replyingTo.type === "text"
                ? replyingTo.text
                : `[${replyingTo.type}] ${replyingTo.text || ""}`}
            </div>
          </div>
          {replyingTo.thumbnail && (
            <img
              src={
                replyingTo.thumbnail.startsWith("data:")
                  ? replyingTo.thumbnail
                  : `data:image/jpeg;base64,${replyingTo.thumbnail}`
              }
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "4px",
                objectFit: "cover",
              }}
            />
          )}
          <button
            onClick={() => setReplyingTo?.(null)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {showMenu && (
        <div style={styles.attachmentMenu}>
          {attachments.map((item, i) => (
            <div
              key={i}
              style={styles.menuItem}
              onClick={item.onClick}
              onMouseDown={(e) =>
                (e.currentTarget.style.transform = "scale(0.95)")
              }
              onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            >
              <div style={{ ...styles.menuIcon, backgroundColor: item.color }}>
                {item.icon}
              </div>
              <span style={styles.menuLabel}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...styles.inputContainer, margin: "0 16px 16px 16px" }}>
        <div
          onClick={() => setShowMenu(!showMenu)}
          style={{
            ...styles.plusBtnContainer,
            transform: showMenu ? "rotate(45deg)" : "rotate(0deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Plus size={24} />
        </div>

        <textarea
          ref={textareaRef}
          rows={1}
          value={isRecording ? "Recording..." : input}
          readOnly={isRecording}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && input.trim()) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Message..."
          style={{
            ...styles.inputField,
            color: isRecording ? "#ef4444" : "white",
          }}
        />

        {input.trim().length > 0 ? (
          <button
            onClick={onSend}
            style={{
              ...styles.sendBtn,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Send size={20} />
          </button>
        ) : (
          <button
            onClick={handleRecord}
            style={{
              ...styles.sendBtn,
              backgroundColor: isRecording ? "#ef4444" : "#6366f1",
              animation: isRecording ? "pulse 1.5s infinite" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Mic size={20} />
          </button>
        )}
      </div>

      <PortShareModal
        isOpen={showPortModal}
        onClose={() => setShowPortModal(false)}
        port={port}
        setPort={setPort}
        onConfirm={() => {
          setShowPortModal(false);
          setShowMenu(false);
        }}
      />
    </div>
  );
};
