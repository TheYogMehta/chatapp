import React, { useState, useEffect, useRef } from "react";
import {
  Lock,
  MoreVertical,
  Paperclip,
  ArrowLeft,
  Shield,
  Trash2,
  Copy,
  Eye,
  FileText,
  Send,
  Key,
  FolderOpen,
} from "lucide-react";
import { useHistory } from "react-router-dom";
import ChatClient from "../../services/ChatClient";
import {
  SecureContainer,
  SecureHeader,
  HeaderLeft,
  TitleContainer,
  SecureTitle,
  StatusText,
  HeaderActions,
  VaultButton,
  MessageList,
  InputArea,
  TextInput,
  SendButton,
  VaultDrawer,
  VaultHeader,
  VaultContent,
  VaultItem as ScVaultItem,
} from "./SecureChat.styles";
import { MessageBubble } from "../Home/components/chat/MessageBubble";
import { ChatMessage } from "../Home/types";
import { colors } from "../../theme/design-system";
import { AppLockScreen } from "../Home/components/overlays/AppLockScreen";
import { useSecureChat } from "./hooks/useSecureChat";
import { VaultItem } from "../../utils/secureStorage";
import { MediaModal } from "../Home/components/chat/MediaModal";

export const SecureChatWindow: React.FC = () => {
  const history = useHistory();
  const [messages, setMessages] = useState<ChatMessage[]>([]); // Using ChatMessage
  const [inputText, setInputText] = useState("");
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    isUnlocked,
    isSetup,
    unlock,
    setupVault,
    items,
    removeItem,
    decryptItemContent,
    error: vaultError,
  } = useSecureChat();

  // Viewing State
  const [viewingItem, setViewingItem] = useState<any>(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: "image" | "video";
    description?: string;
  } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      // Using ChatMessage
      id: Date.now().toString(),
      sid: "vault",
      sender: "me",
      text: inputText, // Changed content to text
      type: "text",
      timestamp: Date.now(),
      status: 1, // Using integer status
    };

    setMessages([...messages, newMsg]);
    setInputText("");

    // Simulate echo
    setTimeout(() => {
      const echoMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sid: "vault",
        sender: "other", // 'them' -> 'other'
        text: "Encrypted echo: " + inputText,
        type: "text",
        timestamp: Date.now(),
        status: 2,
      };
      setMessages((prev) => [...prev, echoMsg]);
    }, 1000);
  };

  const handleViewItem = async (item: any) => {
    try {
      const decrypted = await decryptItemContent(item);
      if (item.type === "file") {
        const content = decrypted as Uint8Array;
        const blob = new Blob([content as any], {
          type: item.metadata.type,
        });
        const url = URL.createObjectURL(blob);
        setViewingItem({
          ...item,
          contentUrl: url,
          mimeType: item.metadata.type,
          title: item.metadata.filename,
        } as any);
      } else {
        const content = decrypted as string;
        setViewingItem({
          ...item,
          value: content,
          title: item.metadata.username || "Note",
        } as any);
      }
    } catch (e: any) {
      alert("Decryption failed: " + e.message);
    }
  };

  const closeView = () => {
    if (viewingItem?.contentUrl) {
      URL.revokeObjectURL(viewingItem.contentUrl);
    }
    setViewingItem(null);
  };

  const handleMediaClick = (url: string, type: "image" | "video", description?: string) => {
    setSelectedMedia({ url, type, description });
    setMediaModalOpen(true);
  };

  if (!isUnlocked) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          background: colors.background.primary,
        }}
      >
        <AppLockScreen
          mode="input"
          userEmail={ChatClient.userEmail || ""}
          title={isSetup ? "Secure Vault Locked" : "Setup Vault PIN"}
          description={
            isSetup
              ? "Enter your PIN to access the vault"
              : "Create a PIN for your secure vault"
          }
          onSuccess={(pin) => {
            if (isSetup) {
              unlock(pin || "");
            } else {
              setupVault(pin || "");
            }
          }}
          onCancel={() => history.push("/home")}
        />
        {vaultError && (
          <div
            style={{
              position: "absolute",
              bottom: "100px",
              width: "100%",
              textAlign: "center",
              color: colors.status.error,
              zIndex: 3000,
            }}
          >
            <p>{vaultError}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <SecureContainer>
      <SecureHeader>
        <HeaderLeft>
          <button
            onClick={() => history.push("/home")}
            style={{
              background: "none",
              border: "none",
              color: colors.text.primary,
              padding: 0,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={24} />
          </button>

          <TitleContainer>
            <SecureTitle>
              <Shield size={18} color={colors.primary.DEFAULT} />
              Secure Vault Chat
            </SecureTitle>
            <StatusText>
              End-to-End Encrypted • Self-Destructing Messages
            </StatusText>
          </TitleContainer>
        </HeaderLeft>

        <HeaderActions>
          <VaultButton
            isActive={isVaultOpen}
            onClick={() => setIsVaultOpen(!isVaultOpen)}
          >
            {isVaultOpen ? <Key size={18} /> : <Lock size={18} />}
            <span>Vault</span>
          </VaultButton>
          <button
            style={{
              background: "none",
              border: "none",
              color: colors.text.primary,
              cursor: "pointer",
            }}
          >
            <MoreVertical size={24} />
          </button>
        </HeaderActions>
      </SecureHeader>

      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          overflow: "hidden",
        }}
      >
        <MessageList onClick={() => setIsVaultOpen(false)}>
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              color: colors.text.tertiary,
              fontSize: "0.8rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Shield size={32} color={colors.status.success} />
            <span>
              Messages in this chat are end-to-end encrypted and not stored on
              any server.
            </span>
          </div>

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg} // Fixed prop name from message to msg
              onReply={() => { }}
              onMediaClick={handleMediaClick}
            />
          ))}
          <div ref={messagesEndRef} />
        </MessageList>

        <VaultDrawer isOpen={isVaultOpen}>
          <VaultHeader>
            <h3>
              <FolderOpen size={20} color={colors.primary.DEFAULT} />
              Secure Vault
            </h3>
            <button
              onClick={() => setIsVaultOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: colors.text.secondary,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </VaultHeader>
          <VaultContent>
            {items.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: colors.text.tertiary,
                }}
              >
                Vault is empty
              </div>
            ) : (
              items.map((item) => (
                <ScVaultItem key={item.id} onClick={() => handleViewItem(item)}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span
                      style={{
                        color: "white",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {item.type === "password" && <Key size={14} />}
                      {item.type === "text" && <FileText size={14} />}
                      {item.type === "file" && <Paperclip size={14} />}
                      {item.type === "password"
                        ? item.metadata.username
                        : item.metadata.filename || "Note"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: colors.text.tertiary,
                      }}
                    >
                      {item.timestamp
                        ? new Date(item.timestamp).toLocaleDateString()
                        : "Unknown Date"}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete?")) removeItem(item.id);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: colors.status.error,
                      cursor: "pointer",
                      padding: "4px",
                      float: "right",
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </ScVaultItem>
              ))
            )}
          </VaultContent>
        </VaultDrawer>
      </div>

      <InputArea>
        <button
          style={{
            background: "none",
            border: "none",
            color: colors.text.secondary,
            cursor: "pointer",
          }}
        >
          <Paperclip size={20} />
        </button>
        <TextInput
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a secure message..."
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
        />
        <SendButton onClick={handleSendMessage} disabled={!inputText.trim()}>
          <Send size={20} />
        </SendButton>
      </InputArea>

      {/* Viewing Item Modal */}
      {viewingItem && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 2000,
            display: "flex",
            flexDirection: "column",
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "20px",
            }}
          >
            <h3 style={{ color: "white", margin: 0 }}>{viewingItem.title}</h3>
            <button
              onClick={closeView}
              style={{
                background: "none",
                border: "none",
                color: "white",
                fontSize: "24px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflow: "auto",
              background: "#111",
              padding: "20px",
              borderRadius: "8px",
            }}
          >
            {viewingItem.type === "password" && (
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <code style={{ fontSize: "1.2rem", color: "#fbbf24" }}>
                  {viewingItem.value}
                </code>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(viewingItem.value)
                  }
                  style={{ background: "none", border: "none", color: "#aaa" }}
                >
                  <Copy size={20} />
                </button>
              </div>
            )}
            {viewingItem.type === "note" && (
              <p style={{ color: "#ddd", whiteSpace: "pre-wrap" }}>
                {viewingItem.value}
              </p>
            )}
            {viewingItem.type === "file" &&
              viewingItem.mimeType?.startsWith("image/") && (
                <img
                  src={viewingItem.contentUrl}
                  alt="Decrypted"
                  style={{ maxWidth: "100%" }}
                />
              )}
            {viewingItem.type === "file" &&
              !viewingItem.mimeType?.startsWith("image/") && (
                <div style={{ textAlign: "center", padding: "40px" }}>
                  <p style={{ color: "white" }}>File decrypted successfully.</p>
                  <a
                    href={viewingItem.contentUrl}
                    download={viewingItem.title}
                    style={{ color: "#60a5fa" }}
                  >
                    Download File
                  </a>
                </div>
              )}
          </div>
        </div>
      )}
      {/* Media Viewer Modal */}
      <MediaModal
        isOpen={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        media={selectedMedia}
      />
    </SecureContainer>
  );
};
