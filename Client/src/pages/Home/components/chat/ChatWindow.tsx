import React, { useEffect, useRef, useState } from "react";
import { styles } from "../../Home.styles";
import { MessageBubble } from "./MessageBubble";
import { PortShareModal } from "./PortShareModal";
import ChatClient from "../../../../services/ChatClient";
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
} from "lucide-react";

export const ChatWindow = ({
  messages,
  input,
  setInput,
  onSend,
  activeChat,
  onFileSelect,
}: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showMenu, setShowMenu] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");
  const [isRecording, setIsRecording] = useState(false);

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
    <div style={styles.chatWindow}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
      <div ref={scrollRef} style={styles.messageList}>
        {messages.map((msg: any, i: number) => (
          <MessageBubble key={i} msg={msg} />
        ))}
      </div>

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

      <div style={styles.inputContainer}>
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
        onConfirm={(p) => {
          setShowPortModal(false);
          setShowMenu(false);
        }}
      />
    </div>
  );
};
