import React from "react";
import { styles } from "../../Home.styles";
import ChatClient from "../../../../services/ChatClient";

interface SidebarItemProps {
  sid: string;
  isActive: boolean;
  onSelect: (sid: string) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  sid,
  isActive,
  onSelect,
}) => {
  const session = ChatClient.sessions[sid];
  const isOnline = session?.online;
  const displayName = session?.peerEmail || `Peer ${sid.slice(0, 6)}`;

  return (
    <div
      onClick={() => onSelect(sid)}
      style={{
        ...styles.sessionItem,
        background: isActive ? "rgba(99, 102, 241, 0.15)" : "transparent",
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
        <div style={styles.sessionName}>{displayName}</div>
        <div
          style={{
            fontSize: "0.7rem",
            color: isOnline ? "#22c55e" : "#64748b",
            marginTop: "2px",
          }}
        >
          ● {isOnline ? "Online" : "Offline"}
        </div>
      </div>
    </div>
  );
};
