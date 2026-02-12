import React, { useEffect, useState, useRef } from "react";
import { useRecentEmojis } from "../../../../hooks/useRecentEmojis";
import { ChatMessage } from "../../types";
import ChatClient from "../../../../services/core/ChatClient";
import { StorageService } from "../../../../services/storage/StorageService";
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
import { LinkPreview } from "../../../../components/LinkPreview";

import { AudioBubble } from "./bubbles/AudioBubble";
import { ImageBubble } from "./bubbles/ImageBubble";
import { VideoBubble } from "./bubbles/VideoBubble";
import { FileBubble } from "./bubbles/FileBubble";

import { queryDB } from "../../../../services/storage/sqliteService";
import { Reaction } from "../../types";
import { isTrustedUrl } from "../../../../utils/trustedDomains";
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
}: {
  msg: ChatMessage;
  onReply?: (msg: ChatMessage | null) => void;
  onMediaClick?: (
    url: string,
    type: "image" | "video",
    description?: string,
  ) => void;
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
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

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
      // Fallback for non-secure contexts or permission issues
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed"; // Avoid scrolling
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

  const handleLinkClick = async (e: React.MouseEvent, url: string) => {
    // If trusted, let the browser handle the click natively (avoids popup blockers)
    if (isTrustedUrl(url)) {
      return;
    }

    e.preventDefault();
    // continue with safety check...

    try {
      const status = await ChatClient.checkLinkSafety(url);
      console.log("Safety status:", status);
    } catch (e) {
      console.error("Failed to check link safety", e);
    }
  };

  useEffect(() => {
    if (prevMsgId.current !== msg.id) {
      setImageSrc(null);
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

    if (msg.type === "gif") {
      // Reusing ImageBubble for GIF as it has similar behavior, or keep inline if simple
      // Ideally ImageBubble handles it, but ImageBubble has download overlays etc which GIF might not need in same way
      // But let's use ImageBubble with specific props or just MediaContainer as before for now to match exactly
      return (
        <MediaContainer>
          <img
            src={msg.text}
            alt="gif"
            referrerPolicy="no-referrer"
            onClick={(e) => {
              e.stopPropagation();
              if (onMediaClick) {
                onMediaClick(msg.text || "", "image", "GIF");
              } else {
                window.open(msg.text, "_blank");
              }
            }}
            style={{
              width: "100%",
              height: "auto",
              borderRadius: "8px",
              cursor: "pointer",
              minHeight: "100px",
            }}
          />
        </MediaContainer>
      );
    }

    return null;
  };

  const isEditable =
    isMe &&
    Date.now() - msg.timestamp < 15 * 60 * 1000 &&
    msg.type !== "deleted"; // 15 mins
  const isDeletable =
    isMe &&
    Date.now() - msg.timestamp < 24 * 60 * 60 * 1000 &&
    msg.type !== "deleted"; // 24 hours

  // ...

  const onTouchStart = (e: React.TouchEvent) => {
    // Capture coordinates synchronously!
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    touchStartX.current = clientX;
    // Store Y for potential vertical scroll detection if needed, but not used for swipe

    setIsSwiping(true);

    // Context Menu Long Press Logic
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

    // If moving, cancel long press (increased threshold to 30px)
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

  const urlMatch = msg.text?.match(/(https?:\/\/[^\s]+)/);
  const firstUrl = urlMatch ? urlMatch[0] : null;

  const groupedReactions = reactions.reduce((acc: any, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());
  const safeDate = new Date(msg.timestamp);
  const timeString = isValidDate(safeDate)
    ? safeDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  return (
    <BubbleWrapper
      isMe={isMe}
      hasReactions={Object.keys(groupedReactions).length > 0}
      onContextMenu={handleContextMenu}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
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

      <Bubble
        isMe={isMe}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping
            ? "none"
            : "transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
        }}
      >
        <ReplyButton
          isMe={isMe}
          onClick={(e) => {
            e.stopPropagation();
            onReply?.(msg);
          }}
        >
          <Reply size={16} />
        </ReplyButton>

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
              onClick={() =>
                window.open(`http://localhost:${msg.shared?.port}`)
              }
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
                    {msg.text &&
                      msg.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                        part.match(/https?:\/\//) ? (
                          <a
                            key={i}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => handleLinkClick(e, part)}
                            style={{ color: "#60a5fa", cursor: "pointer" }}
                          >
                            {part}
                          </a>
                        ) : (
                          part
                        ),
                      )}
                    {/* Link Previews */}
                    {firstUrl && !msg.mediaFilename && (
                      <div style={{ marginTop: "8px", maxWidth: "400px" }}>
                        {isTrustedUrl(firstUrl) &&
                        /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(
                          new URL(firstUrl).pathname,
                        ) ? (
                          <MediaContainer>
                            <img
                              src={firstUrl}
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
                                onMediaClick?.(firstUrl, "image", msg.text);
                              }}
                            />
                          </MediaContainer>
                        ) : (
                          <LinkPreview url={firstUrl} />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Detailed Reaction Chips */}
        {Object.keys(groupedReactions).length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "4px",
              flexWrap: "wrap",
              marginTop: "8px",
              marginBottom: "4px",
              justifyContent: isMe ? "flex-end" : "flex-start",
            }}
          >
            {Object.entries(
              reactions.reduce((acc: any, r) => {
                if (!acc[r.emoji]) {
                  acc[r.emoji] = { count: 0, hasMe: false };
                }
                acc[r.emoji].count++;
                if (
                  r.senderEmail === "me" ||
                  r.senderEmail === ChatClient.userEmail
                ) {
                  acc[r.emoji].hasMe = true;
                }
                return acc;
              }, {}),
            )
              .sort((a: any, b: any) => b[1].count - a[1].count)
              .slice(0, 5)
              .map(([emoji, stats]: [string, any]) => (
                <div
                  key={emoji}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (msg.sid && msg.id) {
                      try {
                        await ChatClient.sendReaction(
                          msg.sid,
                          msg.id,
                          emoji,
                          stats.hasMe ? "remove" : "add",
                        );
                      } catch (err) {
                        console.error("Failed to send reaction", err);
                      }
                    }
                  }}
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.2)",
                    border: stats.hasMe
                      ? "1px solid #3b82f6"
                      : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "4px 8px",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <span>{emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: "0.75rem" }}>
                    {stats.count}
                  </span>
                </div>
              ))}
          </div>
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
          {timeString}
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
    </BubbleWrapper>
  );
};
