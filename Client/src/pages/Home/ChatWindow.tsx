import React, { useEffect, useRef, useState } from "react";
import { styles } from "./Home.styles";
import { ChatMessage } from "./types";

export const ChatWindow = ({ messages, input, setInput, onSend }: any) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const attachments = [
    { label: "Document", icon: "📄", color: "#7f5af0" },
    { label: "Camera", icon: "📷", color: "#ff8906" },
    { label: "Gallery", icon: "🖼️", color: "#e53170" },
    { label: "Audio", icon: "🎧", color: "#2cb67d" },
    { label: "Live Share", icon: "🌐", color: "#3b82f6" },
    { label: "Location", icon: "📍", color: "#34d399" },
  ];

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "");
    setPort(value);
  };

  const handleRecord = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      console.log("Started recording...");
    } else {
      console.log("Stopped recording and sending...");
      // Logic for sending audio would go here
    }
  };

  return (
    <div style={styles.chatContainer}>
      <div style={styles.messageArea} ref={scrollRef}>
        {messages.map((m: ChatMessage, i: number) => (
          <div
            key={i}
            style={{
              ...styles.messageRow,
              justifyContent: m.sender === "me" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                ...styles.bubble,
                background: m.sender === "me" 
                  ? "linear-gradient(135deg, #6366f1, #4f46e5)" 
                  : "#1e293b",
                borderRadius: m.sender === "me" ? "18px 18px 2px 18px" : "18px 18px 18px 2px",
              }}
            >
              <div>{m.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.inputWrapper}>
        {showMenu && (
          <div style={styles.attachmentGrid}>
            {attachments.map((item) => (
              <div 
                key={item.label} 
                style={styles.attachmentItem} 
                onClick={() => {
                  setShowMenu(false);
                  if (item.label === "Live Share") setShowPortModal(true);
                }}
              >
                <div style={{ ...styles.attachmentCircle, backgroundColor: item.color }}>
                  {item.icon}
                </div>
                <span style={styles.attachmentLabel}>{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {showPortModal && (
          <div style={styles.portModal}>
            <div style={styles.portModalContent}>
              <h4 style={{ margin: "0 0 10px 0" }}>Live Share Port</h4>
              <input 
                type="text" 
                inputMode="numeric"
                placeholder="Port (e.g. 8080)" 
                value={port}
                onChange={handlePortChange}
                style={styles.portInput}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
                <button onClick={() => setShowPortModal(false)} style={styles.portCancelBtn}>Cancel</button>
                <button onClick={() => setShowPortModal(false)} style={styles.portSendBtn}>Send</button>
              </div>
            </div>
          </div>
        )}

        <div style={styles.inputContainer}>
          <div 
            onClick={() => setShowMenu(!showMenu)} 
            style={{ 
              ...styles.plusBtnContainer,
              transform: showMenu ? "rotate(45deg)" : "rotate(0deg)"
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
            style={{ ...styles.inputField, color: isRecording ? "#ef4444" : "white" }}
          />

          {/* Conditional Button: Send or Record */}
          {input.trim().length > 0 ? (
            <button onClick={onSend} style={styles.sendBtn}>🚀</button>
          ) : (
            <button 
              onClick={handleRecord} 
              style={{ 
                ...styles.sendBtn, 
                backgroundColor: isRecording ? "#ef4444" : "#6366f1",
                animation: isRecording ? "pulse 1.5s infinite" : "none"
              }}
            >
              🎤
            </button>
          )}
        </div>
      </div>
    </div>
  );
};