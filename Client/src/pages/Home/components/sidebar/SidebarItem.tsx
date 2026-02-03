import React from "react";
import { styles } from "../../Home.styles";
import ChatClient from "../../../../services/ChatClient";
import { SessionData } from "../../types";

interface SidebarItemProps {
  data: SessionData;
  isActive: boolean;
  onSelect: (sid: string) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  data,
  isActive,
  onSelect,
}) => {
  const { sid, lastMsg, lastMsgType, unread, online } = data;
  const isOnline = online;
  const displayName =
    ChatClient.sessions[sid]?.peerEmail || `Peer ${sid.slice(0, 6)}`;

  const getPreviewText = () => {
    if (!lastMsg && !lastMsgType) return isOnline ? "Online" : "Offline";

    switch (lastMsgType) {
      case "image":
        return "📷 Image";
      case "video":
        return "🎥 Video";
      case "audio":
        return "🎤 Voice Message";
      case "file":
        return "📄 File";
      case "sticker":
        return "Sticker";
      default:
        return lastMsg;
    }
  };

  return (
    <div
      onClick={() => onSelect(sid)}
      style={{
        ...styles.sessionItem,
        background: isActive ? "rgba(99, 102, 241, 0.15)" : "transparent",
        position: "relative",
      }}
    >
      <div
        style={{
          ...styles.avatar,
          borderColor: isOnline ? "#22c55e" : "#334155",
        }}
      >
        {displayName[0].toUpperCase()}
      </div>
      <div style={styles.sessionInfo}>
        <div
          style={{
            ...styles.sessionName,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>{displayName}</span>
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: isActive ? "rgba(255,255,255,0.9)" : "#94a3b8",
            marginTop: "2px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {getPreviewText()}
        </div>
      </div>

      {unread > 0 && (
        <div
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: "#ef4444",
            color: "white",
            borderRadius: "50%",
            minWidth: "20px",
            height: "20px",
            fontSize: "0.75rem",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            boxShadow: "0 2px 5px rgba(239, 68, 68, 0.4)",
          }}
        >
          {unread > 99 ? "99+" : unread}
        </div>
      )}
    </div>
  );
};
