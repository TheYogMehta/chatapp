import React, { useEffect, useState, useRef } from "react";
import { useRecentEmojis } from "../../../../hooks/useRecentEmojis";
import { ChatMessage } from "../../types";
import ChatClient from "../../../../services/core/ChatClient";
import { StorageService } from "../../../../services/storage/StorageService";
import { Capacitor } from "@capacitor/core";
import {
  Reply,
  Plus,
  Globe,
  Check,
  CheckCheck,
  Copy,
  Edit2,
  Trash2,
  X,
} from "lucide-react";
import { EmojiPicker } from "../../../../components/EmojiPicker";
import { Avatar } from "../../../../components/ui/Avatar";
import { UnsafeLinkModal } from "./UnsafeLinkModal";

import { AudioBubble } from "./bubbles/AudioBubble";
import { ImageBubble } from "./bubbles/ImageBubble";
import { VideoBubble } from "./bubbles/VideoBubble";
import { FileBubble } from "./bubbles/FileBubble";

import { queryDB } from "../../../../services/storage/sqliteService";
import { Reaction } from "../../types";
import {
  isTrustedUrl,
  DEFAULT_TRUSTED_DOMAINS,
} from "../../../../utils/trustedDomains";
import {
  BubbleWrapper,
  Bubble,
  ReplyButton,
  ReplyContext,
  MediaContainer,
  ContextMenuContainer,
  ContextMenuItem,
  ReactionBar,
  ReactionButton,
  MoreReactionsButton,
  ReactionBubble,
  EditInputContainer,
  EditInput,
  EditActionButtons,
  EditButton,
} from "./Chat.styles";

export const MessageBubble = ({
  msg,
  onReply,
  onMediaClick,
  messageLayout = "bubble",
  senderName,
  senderAvatar,
}: {
  msg: ChatMessage;
  onReply?: (msg: ChatMessage | null) => void;
  onMediaClick?: (
    url: string,
    type: "image" | "video",
    description?: string,
  ) => void;
  messageLayout?: "bubble" | "modern";
  senderName?: string;
  senderAvatar?: string;
}) => {
  const isMe = msg.sender === "me";
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchMoveX = useRef(0);
  const prevMsgId = useRef<string>(msg.id);

  const [isLoading, setIsLoading] = useState(false);
  const [isRequestingDownload, setIsRequestingDownload] = useState(false);
  const [inlineMedia, setInlineMedia] = useState<
    Array<{ sourceUrl: string; resolvedUrl: string; type: "image" | "video" }>
  >([]);

  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const { recentEmojis, trackEmoji } = useRecentEmojis();

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || "");
  const [pendingExternalUrl, setPendingExternalUrl] = useState<string | null>(
    null,
  );
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const inlineObjectUrlsRef = useRef<string[]>([]);
  const urlRegex = () => /https?:\/\/[^\s<>()]+/gi;

  const normalizeUrlToken = (value: string): string =>
    value.replace(/[),.;!?]+$/g, "");

  const extractUrlsFromText = (text: string): string[] => {
    const matches = Array.from(text.matchAll(urlRegex())).map((m) =>
      normalizeUrlToken(m[0]),
    );
    return Array.from(new Set(matches.filter(Boolean)));
  };

  const renderTextWithLinks = (text: string) => {
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let i = 0;

    for (const match of text.matchAll(urlRegex())) {
      const raw = match[0];
      const matchIndex = match.index ?? 0;
      const clean = normalizeUrlToken(raw);
      const suffix = raw.slice(clean.length);

      if (matchIndex > lastIndex) {
        nodes.push(text.slice(lastIndex, matchIndex));
      }

      nodes.push(
        <a
          key={`url-${i}-${clean}`}
          href={clean}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleMessageLinkClick(e, clean)}
          style={{ color: "#60a5fa", cursor: "pointer" }}
        >
          {clean}
        </a>,
      );

      if (suffix) nodes.push(suffix);
      lastIndex = matchIndex + raw.length;
      i += 1;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes.length ? nodes : text;
  };

  useEffect(() => {
    const handleClickOutside = () =>
      setContextMenu({ visible: false, x: 0, y: 0 });
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  };

  const handleCopy = async () => {
    const text = msg.text || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn("Clipboard API failed, trying fallback", err);
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        console.error("Fallback copy failed", e);
        alert("Failed to copy text");
      }
      document.body.removeChild(textArea);
    }
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditText(msg.text || "");
    setContextMenu({ visible: false, x: 0, y: 0 });
  };

  const handleSaveEdit = () => {
    if (msg.sid && msg.id && editText && editText.trim() !== "") {
      ChatClient.editMessage(msg.sid, msg.id, editText);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(msg.text || "");
  };

  const handleDelete = () => {
    if (msg.sid && msg.id) {
      ChatClient.deleteMessage(msg.sid, msg.id);
      setContextMenu({ visible: false, x: 0, y: 0 });
    }
  };

  useEffect(() => {
    loadReactions();

    const onUpdate = () => {
      loadReactions();
    };

    ChatClient.on(`reaction_update:${msg.id}`, onUpdate);
    return () => {
      ChatClient.off(`reaction_update:${msg.id}`, onUpdate);
    };
  }, [msg.id]);

  const loadReactions = async () => {
    try {
      const rows = await queryDB(
        "SELECT * FROM reactions WHERE message_id = ?",
        [msg.id],
      );
      const mapped: Reaction[] = rows.map((r: any) => ({
        id: r.id,
        messageId: r.message_id,
        senderEmail: r.sender_email,
        emoji: r.emoji,
        timestamp: r.timestamp,
      }));
      setReactions(mapped);
    } catch (e) {
      console.error("Failed to load reactions", e);
    }
  };

  const handleReaction = (emojiData: any) => {
    if (msg.sid && msg.id) {
      ChatClient.sendReaction(msg.sid, msg.id, emojiData.emoji, "add");
      setShowPicker(false);
    }
  };

  const openExternalUrl = async (url: string) => {
    if (!/^https?:\/\//i.test(url)) return;

    try {
      if (window.electron?.openExternal) {
        const ok = await window.electron.openExternal(url);
        if (ok) return;
      }

      if (Capacitor.getPlatform() === "android") {
        const browserOpen = (window as any)?.Capacitor?.Plugins?.Browser?.open;
        if (typeof browserOpen === "function") {
          await browserOpen({ url });
          return;
        }
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open external URL:", e);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleMessageLinkClick = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    const matchedInline = inlineMedia.find((m) => m.sourceUrl === url);
    if (matchedInline) {
      if (matchedInline.type === "image") {
        onMediaClick?.(matchedInline.resolvedUrl, "image", msg.text);
      }
      return;
    }

    if (isTrustedUrl(url)) {
      openExternalUrl(url);
      return;
    }

    setPendingExternalUrl(url);
  };

  useEffect(() => {
    if (prevMsgId.current !== msg.id) {
      setImageSrc(null);
      for (const objUrl of inlineObjectUrlsRef.current) {
        URL.revokeObjectURL(objUrl);
      }
      inlineObjectUrlsRef.current = [];
      setInlineMedia([]);
      prevMsgId.current = msg.id;
    }

    if (msg.mediaStatus === "downloaded" && msg.mediaFilename && !imageSrc) {
      setIsLoading(true);
      setIsRequestingDownload(false);
      StorageService.getFileSrc(msg.mediaFilename, msg.mediaMime).then(
        (src) => {
          setImageSrc(src);
          setIsLoading(false);
        },
      );
    } else if (msg.mediaStatus === "downloading") {
      setIsRequestingDownload(false);
    }
  }, [msg.id, msg.mediaStatus, msg.mediaFilename, msg.mediaMime, imageSrc]);

  useEffect(() => {
    let active = true;
    for (const objUrl of inlineObjectUrlsRef.current) {
      URL.revokeObjectURL(objUrl);
    }
    inlineObjectUrlsRef.current = [];
    setInlineMedia([]);

    const mediaTypeFromUrl = (url: string): "image" | "video" | null => {
      try {
        const pathname = new URL(url).pathname.toLowerCase();
        if (/\.(jpeg|jpg|png|webp|svg|bmp|avif|gif)$/i.test(pathname)) {
          return "image";
        }
        if (/\.(mp4|webm|mov|m4v)$/i.test(pathname)) {
          return "video";
        }
        return null;
      } catch {
        return null;
      }
    };

    const isAllowedMediaUrl = (url: string): boolean => {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        return DEFAULT_TRUSTED_DOMAINS.some((domain) =>
          hostname.endsWith(domain),
        );
      } catch {
        return false;
      }
    };

    const loadInlineMedia = async () => {
      const text = msg.text || "";
      if (!text || msg.mediaFilename) return;

      const candidates = extractUrlsFromText(text)
        .map((url) => ({ url, type: mediaTypeFromUrl(url) }))
        .filter(
          (entry): entry is { url: string; type: "image" | "video" } =>
            !!entry.type && isAllowedMediaUrl(entry.url),
        );

      if (!candidates.length) return;

      const loaded: Array<{
        sourceUrl: string;
        resolvedUrl: string;
        type: "image" | "video";
      }> = [];

      for (const candidate of candidates) {
        const fetchAsBlobUrl = async (): Promise<string | null> => {
          try {
            const res = await fetch(candidate.url, { method: "GET", mode: "cors" });
            if (res.ok) {
              const blob = await res.blob();
              if (blob.size > 0) {
                const objectUrl = URL.createObjectURL(blob);
                inlineObjectUrlsRef.current.push(objectUrl);
                return objectUrl;
              }
            }
          } catch (_e) {
            // Try no-cors fallback below.
          }

          try {
            const res = await fetch(candidate.url, {
              method: "GET",
              mode: "no-cors",
            });
            const blob = await res.blob();
            if (blob.size > 0) {
              const objectUrl = URL.createObjectURL(blob);
              inlineObjectUrlsRef.current.push(objectUrl);
              return objectUrl;
            }
          } catch (_e) {
            // Fetch-only mode: if both fail, skip embed.
          }

          return null;
        };

        try {
          const objectUrl = await fetchAsBlobUrl();
          if (!objectUrl) continue;
          loaded.push({
            sourceUrl: candidate.url,
            resolvedUrl: objectUrl,
            type: candidate.type,
          });
        } catch (_e) {
          // Fetch-only mode: if fetch/CORS fails, skip inline embed.
        }
      }

      if (active) setInlineMedia(loaded);
    };

    loadInlineMedia();

    return () => {
      active = false;
    };
  }, [msg.id, msg.text, msg.mediaFilename]);

  const handleDownload = () => {
    if (isDownloading) return;
    console.log(`[MessageBubble] Download clicked for ${msg.id}`);
    if (msg.sid && msg.id) {
      setIsRequestingDownload(true);
      ChatClient.requestDownload(msg.sid, msg.id);
      setTimeout(() => {
        setIsRequestingDownload((d) => {
          if (d) console.log("Resetting stuck download state");
          return false;
        });
      }, 5000);
    }
  };

  const handleSave = async () => {
    if (msg.mediaFilename && msg.text) {
      try {
        const savedPath = await StorageService.saveToDownloads(
          msg.mediaFilename,
          msg.text,
        );
        alert(`Saved to: ${savedPath}`);
      } catch (e) {
        console.error("Save failed:", e);
        alert("Failed to save file.");
      }
    } else if (imageSrc) {
      const a = document.createElement("a");
      a.href = imageSrc;
      a.download = msg.text || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const isDownloading =
    msg.mediaStatus === "downloading" || isRequestingDownload;
  const isDownloaded = msg.mediaStatus === "downloaded";

  const renderMediaContent = () => {
    let processedThumbnail = msg.thumbnail;
    if (
      processedThumbnail &&
      !processedThumbnail.startsWith("data:") &&
      !processedThumbnail.startsWith("http")
    ) {
      processedThumbnail = `data:image/jpeg;base64,${processedThumbnail}`;
    }
    const thumbnailSrc =
      msg.tempUrl || processedThumbnail || (msg.media && msg.media.url) || null;

    if (msg.type === "image") {
      return (
        <ImageBubble
          src={imageSrc}
          thumbnailSrc={thumbnailSrc}
          text={msg.text || null}
          mediaStatus={msg.mediaStatus || ""}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          isRequestingDownload={isRequestingDownload}
          progress={msg.mediaProgress || 0}
          isLoading={isLoading}
          onDownload={handleDownload}
          onSave={handleSave}
          onMediaClick={onMediaClick}
        />
      );
    }

    if (msg.type === "audio") {
      return (
        <AudioBubble
          src={imageSrc}
          onDownload={handleDownload}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          progress={msg.mediaProgress || 0}
          isMe={isMe}
          onSave={handleSave}
        />
      );
    }

    if (msg.type === "video") {
      return (
        <VideoBubble
          src={imageSrc}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          isRequestingDownload={isRequestingDownload}
          progress={msg.mediaProgress || 0}
          onDownload={handleDownload}
          onMediaClick={onMediaClick}
          text={msg.text || null}
        />
      );
    }

    if (msg.type === "file") {
      return (
        <FileBubble
          text={msg.text || null}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          progress={msg.mediaProgress || 0}
          onDownload={handleDownload}
          onSave={handleSave}
        />
      );
    }

    return null;
  };

  const isEditable =
    isMe &&
    Date.now() - msg.timestamp < 15 * 60 * 1000 &&
    msg.type !== "deleted"; // 15 mins
  const isDeletable = msg.type !== "deleted";

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    touchStartX.current = clientX;

    setIsSwiping(true);

    pressTimer.current = setTimeout(() => {
      setContextMenu({
        visible: true,
        x: clientX,
        y: clientY,
      });
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchMoveX.current = e.touches[0].clientX;
    const diff = touchMoveX.current - touchStartX.current;

    if (Math.abs(diff) > 30) {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    }

    if (!isSwiping) return;
    if (diff > 0) {
      setSwipeOffset(Math.min(diff, 60));
    }
  };

  const onTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);

    if (swipeOffset >= 50 && onReply) {
      onReply(msg);
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }
    }
    setSwipeOffset(0);
    setIsSwiping(false);
  };

  const groupedReactions = Object.entries(
    reactions.reduce(
      (acc: Record<string, { count: number; mine: boolean }>, r) => {
        if (!acc[r.emoji]) {
          acc[r.emoji] = { count: 0, mine: false };
        }
        acc[r.emoji].count += 1;
        if (r.senderEmail === "me") {
          acc[r.emoji].mine = true;
        }
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b[1].count - a[1].count);

  const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());
  const safeDate = new Date(msg.timestamp);
  const timeString = isValidDate(safeDate)
    ? safeDate.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const isModernLayout = messageLayout === "modern" && msg.type !== "system";

  const bubbleNode = (
    <Bubble
      isMe={isModernLayout ? false : isMe}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: isSwiping
          ? "none"
          : "transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
        ...(isModernLayout
          ? {
              borderRadius: "8px",
              backgroundColor: "rgba(255,255,255,0.04)",
              color: "#e5e7eb",
              maxWidth: "100%",
            }
          : {}),
      }}
    >
      {!isModernLayout && (
        <ReplyButton
          isMe={isMe}
          onClick={(e) => {
            e.stopPropagation();
            onReply?.(msg);
          }}
        >
          <Reply size={16} />
        </ReplyButton>
      )}

      {msg.replyTo && (
        <ReplyContext>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: "bold", marginBottom: "2px" }}>
              {msg.replyTo.sender}
            </div>
            <div
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: 0.8,
              }}
            >
              {msg.replyTo.type === "text"
                ? msg.replyTo.text
                : `[${msg.replyTo.type}] ${msg.replyTo.text || ""}`}
            </div>
          </div>
          {msg.replyTo.thumbnail && (
            <img
              src={
                msg.replyTo.thumbnail.startsWith("data:")
                  ? msg.replyTo.thumbnail
                  : `data:image/jpeg;base64,${msg.replyTo.thumbnail}`
              }
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "4px",
                objectFit: "cover",
              }}
            />
          )}
        </ReplyContext>
      )}

      {msg.type === "system" ? (
        <div
          style={{
            fontSize: "0.85rem",
            color: "rgba(255, 255, 255, 0.6)",
            textAlign: "center",
            fontStyle: "italic",
            padding: "4px 0",
          }}
        >
          {msg.text}
        </div>
      ) : msg.type === "live share port" ? (
        <div style={{ padding: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Globe size={24} />
            <div>
              <b style={{ display: "block" }}>Dev Port Shared</b>
              <code style={{ fontSize: "0.8rem", opacity: 0.8 }}>
                Port: {msg.shared?.port}
              </code>
            </div>
          </div>
          <button
            onClick={() => window.open(`http://localhost:${msg.shared?.port}`)}
            style={{
              marginTop: "12px",
              width: "100%",
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "white",
              color: "black",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Open Port
          </button>
        </div>
      ) : (
        <>
          {isEditing ? (
            <EditInputContainer onClick={(e) => e.stopPropagation()}>
              <EditInput
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  } else if (e.key === "Escape") {
                    handleCancelEdit();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <EditActionButtons>
                <EditButton
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelEdit();
                  }}
                >
                  <X size={14} /> Cancel
                </EditButton>
                <EditButton
                  variant="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveEdit();
                  }}
                >
                  <Check size={14} /> Save
                </EditButton>
              </EditActionButtons>
            </EditInputContainer>
          ) : (
            <>
              {renderMediaContent() || (
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                  }}
                >
                  {inlineMedia.map((media, idx) => (
                    <MediaContainer style={{ marginBottom: "8px" }} key={`${media.sourceUrl}-${idx}`}>
                      {media.type === "image" ? (
                        <img
                          src={media.resolvedUrl}
                          alt="preview"
                          style={{
                            width: "100%",
                            height: "auto",
                            maxHeight: "300px",
                            borderRadius: "8px",
                            cursor: "zoom-in",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onMediaClick?.(media.resolvedUrl, "image", msg.text);
                          }}
                        />
                      ) : (
                        <video
                          controls
                          src={media.resolvedUrl}
                          style={{
                            width: "100%",
                            height: "auto",
                            maxHeight: "300px",
                            borderRadius: "8px",
                          }}
                        />
                      )}
                    </MediaContainer>
                  ))}
                  {msg.text && renderTextWithLinks(msg.text)}
                </div>
              )}
            </>
          )}
        </>
      )}

      <div
        style={{
          fontSize: "0.65rem",
          opacity: 0.6,
          textAlign: "right",
          marginTop: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "4px",
        }}
      >
        {!isModernLayout && timeString}
        {isMe && (
          <span style={{ display: "flex" }}>
            {msg.status === 2 ? (
              <CheckCheck size={14} strokeWidth={2.5} />
            ) : (
              <Check size={14} strokeWidth={2.5} />
            )}
          </span>
        )}
      </div>
    </Bubble>
  );

  return (
      <BubbleWrapper
      isMe={isModernLayout ? false : isMe}
      hasReactions={groupedReactions.length > 0}
      onContextMenu={handleContextMenu}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {!isModernLayout && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "60px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: swipeOffset / 50,
            transform: `translateX(${swipeOffset - 60}px)`,
            color: "#6366f1",
          }}
        >
          <Reply size={20} />
        </div>
      )}

      {isModernLayout ? (
        <div
          style={{
            display: "flex",
            gap: "10px",
            width: "100%",
            alignItems: "flex-start",
          }}
        >
          <Avatar
            size="sm"
            src={senderAvatar}
            name={senderName || (isMe ? "You" : "User")}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "8px",
                marginBottom: "4px",
              }}
            >
              <span style={{ fontWeight: 700, color: "#f3f4f6" }}>
                {senderName || (isMe ? "You" : "User")}
              </span>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                {timeString}
              </span>
            </div>
            {bubbleNode}
          </div>
        </div>
      ) : (
        bubbleNode
      )}

      {groupedReactions.length > 0 && (
        <ReactionBubble
          isMe={isModernLayout ? false : isMe}
          style={
            isModernLayout
              ? {
                  left: "42px",
                  right: "auto",
                }
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation();
            handleContextMenu(e);
          }}
        >
          {groupedReactions.map(([emoji, info]) => (
            <span
              key={emoji}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 6px",
                borderRadius: "999px",
                border: info.mine
                  ? "1px solid #3b82f6"
                  : "1px solid rgba(255,255,255,0.08)",
                background: info.mine
                  ? "rgba(59,130,246,0.18)"
                  : "rgba(255,255,255,0.02)",
                color: info.mine ? "#bfdbfe" : "inherit",
                fontSize: "11px",
                lineHeight: 1.2,
              }}
            >
              <span>{emoji}</span>
              <span>{info.count}</span>
            </span>
          ))}
        </ReactionBubble>
      )}

      {contextMenu.visible && (
        <React.Fragment>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              zIndex: 999,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({ visible: false, x: 0, y: 0 });
            }}
          />
          <ContextMenuContainer
            x={Math.min(contextMenu.x, window.innerWidth - 360)}
            y={Math.max(70, Math.min(contextMenu.y, window.innerHeight - 300))}
          >
            <ReactionBar>
              {recentEmojis.map((emoji) => (
                <ReactionButton
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReaction({ emoji });
                    trackEmoji(emoji);
                    setContextMenu({ visible: false, x: 0, y: 0 });
                  }}
                >
                  {emoji}
                </ReactionButton>
              ))}
              <MoreReactionsButton
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPicker(true);
                  setContextMenu({ visible: false, x: 0, y: 0 });
                }}
              >
                <Plus size={16} />
              </MoreReactionsButton>
            </ReactionBar>

            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                if (onReply) {
                  onReply(msg);
                  setContextMenu({ visible: false, x: 0, y: 0 });
                }
              }}
            >
              <Reply size={18} /> Reply
            </ContextMenuItem>

            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
            >
              <Copy size={18} /> Copy
            </ContextMenuItem>

            {isEditable && (
              <ContextMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
              >
                <Edit2 size={18} /> Edit
              </ContextMenuItem>
            )}

            {isDeletable && (
              <ContextMenuItem
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
              >
                <Trash2 size={18} /> Delete
              </ContextMenuItem>
            )}
          </ContextMenuContainer>
        </React.Fragment>
      )}

      {showPicker && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPicker(false);
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <EmojiPicker
              onEmojiClick={(emoji: any) => {
                handleReaction(emoji);
                setShowPicker(false);
              }}
              onClose={() => setShowPicker(false)}
            />
          </div>
        </div>
      )}

      {pendingExternalUrl && (
        <UnsafeLinkModal
          url={pendingExternalUrl}
          onCancel={() => setPendingExternalUrl(null)}
          onConfirm={async () => {
            await openExternalUrl(pendingExternalUrl);
            setPendingExternalUrl(null);
          }}
        />
      )}
    </BubbleWrapper>
  );
};
