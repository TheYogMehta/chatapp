import React, { useState, useEffect } from "react";
import { StorageService } from "../utils/Storage";

const UserAvatar: React.FC<{
  avatarUrl?: string | null;
  name?: string;
  size: number;
  style?: React.CSSProperties;
  onClick?: () => void;
  children?: React.ReactNode;
}> = ({ avatarUrl, name, size, style, onClick, children }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!avatarUrl) {
      setSrc(null);
      return;
    }
    if (avatarUrl.startsWith("data:") || avatarUrl.startsWith("http")) {
      setSrc(avatarUrl);
    } else {
      StorageService.getFileSrc(avatarUrl).then((s) => {
        if (active) setSrc(s);
      });
    }
    return () => {
      active = false;
    };
  }, [avatarUrl]);

  return (
    <div
      style={{
        ...style,
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#333",
        backgroundImage: src ? `url(${src})` : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.4) + "px",
        color: "#666",
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden",
        position: "relative",
      }}
      onClick={onClick}
    >
      {!src && (name?.[0] || "?").toUpperCase()}
      {children}
    </div>
  );
};

export default UserAvatar;
