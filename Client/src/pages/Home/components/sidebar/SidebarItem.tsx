import React, { useState, useEffect } from "react";
import { StorageService } from "../../../../utils/Storage";
import { SessionData } from "../../types";
import { Avatar } from "../../../../components/ui/Avatar";
import {
  ItemContainer,
  ItemInfo,
  ItemName,
  ItemPreview,
  UnreadBadge,
} from "./Sidebar.styles";

interface SidebarItemProps {
  data: SessionData;
  isActive: boolean;
  onSelect: (sid: string) => void;
  onRename: (sid: string, currentName: string) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  data,
  isActive,
  onSelect,
  onRename,
}) => {
  const {
    sid,
    lastMsg,
    lastMsgType,
    unread,
    online,
    alias_name,
    alias_avatar,
    peer_name,
    peer_avatar,
    peerEmail,
  } = data;
  const isOnline = online;
  const displayName =
    alias_name || peer_name || peerEmail || `Peer ${sid.slice(0, 6)}`;
  const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>(
    undefined,
  );
  const avatarUrl = alias_avatar || peer_avatar;

  useEffect(() => {
    let active = true;
    if (avatarUrl && !avatarUrl.startsWith("data:")) {
      StorageService.getProfileImage(avatarUrl.replace(/\.jpg$/, "")).then(
        (src) => {
          if (active) setResolvedAvatar(src || undefined);
        },
      );
    } else {
      if (active) setResolvedAvatar(avatarUrl);
    }
    return () => {
      active = false;
    };
  }, [avatarUrl]);

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
    <ItemContainer
      isActive={isActive}
      onClick={() => onSelect(sid)}
      onContextMenu={(e) => {
        e.preventDefault();
        onRename(sid, displayName);
      }}
    >
      <Avatar
        src={resolvedAvatar}
        name={displayName}
        size="md"
        status={isOnline ? "online" : "offline"}
      />

      <ItemInfo>
        <ItemName>
          <span>{displayName}</span>
        </ItemName>
        <ItemPreview isActive={isActive}>{getPreviewText()}</ItemPreview>
      </ItemInfo>

      {unread > 0 && <UnreadBadge>{unread > 99 ? "99+" : unread}</UnreadBadge>}
    </ItemContainer>
  );
};
