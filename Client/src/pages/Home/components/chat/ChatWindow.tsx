import React, { useEffect, useRef, useState } from "react";
import { styles } from "../../Home.styles";
import { MessageBubble } from "./MessageBubble";
import { PortShareModal } from "./PortShareModal";
import ChatClient from "../../../../services/ChatClient";

export const ChatWindow = ({ messages, input, setInput, onSend, activeChat }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // States from your original file
  const [showMenu, setShowMenu] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Restored Auto-resize logic
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
      const filePath = URL.createObjectURL(file); // For web/electron to preview. 
      // Note: Real file path access in Electron usually requires exposing it via electron's IPC if we need the real path for 'fs' access, 
      // but for sending, we might need to read it as ArrayBuffer or Blob.
      
      // Sending logic using ChatClient
      try {
        await ChatClient.sendFile(
             activeChat,
             filePath, // This might need adjustment depending on ChatClient implementation expecting a URI or Blob
             { name: file.name, size: file.size, type: file.type }
        );
      } catch (err) {
        console.error("Failed to send file:", err);
      }
      setShowMenu(false);
    }
  };

  const attachments = [
    { 
      label: "Document", 
      icon: "📄", 
      color: "#7f5af0", 
      onClick: () => fileInputRef.current?.click() 
    },
    { label: "Camera", icon: "📷", color: "#ff8906" },
    { label: "Gallery", icon: "🖼️", color: "#e53170", onClick: () => fileInputRef.current?.click() },
    { label: "Audio", icon: "🎧", color: "#2cb67d" },
    {
      label: "Live Share",
      icon: "🌐",
      color: "#3b82f6",
      onClick: () => setShowPortModal(true),
    },
    { label: "Location", icon: "📍", color: "#f25f5c" },
  ];

  const handleRecord = () => {
    setIsRecording(!isRecording);
    // Logic for recording placeholder
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

      {/* Restored Attachments Menu */}
      {showMenu && (
        <div style={styles.attachmentMenu}>
          {attachments.map((item, i) => (
            <div key={i} style={styles.menuItem} onClick={item.onClick}>
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
          }}
        >
          ＋
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
          <button onClick={onSend} style={styles.sendBtn}>
            🚀
          </button>
        ) : (
          <button
            onClick={handleRecord}
            style={{
              ...styles.sendBtn,
              backgroundColor: isRecording ? "#ef4444" : "#6366f1",
              animation: isRecording ? "pulse 1.5s infinite" : "none",
            }}
          >
            🎤
          </button>
        )}
      </div>

      <PortShareModal
        isOpen={showPortModal}
        onClose={() => setShowPortModal(false)}
        port={port}
        setPort={setPort}
        onConfirm={(p) => {
          // This will be linked to actions.startPortShare(p) in useChatLogic
          setShowPortModal(false);
          setShowMenu(false);
        }}
      />
    </div>
  );
};
