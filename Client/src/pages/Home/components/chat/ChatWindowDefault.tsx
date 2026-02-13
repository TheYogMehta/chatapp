import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { StorageService } from "../../../../services/storage/StorageService";
import ChatClient from "../../../../services/core/ChatClient";
import { MessageBubble } from "./MessageBubble";
import { PortShareModal } from "./PortShareModal";
import { MediaModal } from "./MediaModal";
import { GifPicker } from "../../../../components/GifPicker";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import {
  Send,
  Mic,
  Monitor,
  Plus,
  Image as ImageIcon,
  Camera,
  FileText,
  MapPin,
  Globe,
  Phone,
  ArrowLeft,
  X,
  Video,
  Smile,
  Search,
  Edit2,
  Trash2,
} from "lucide-react";
import { ChatMessage, SessionData } from "../../types";
import { Avatar } from "../../../../components/ui/Avatar";
import { useTheme } from "../../../../theme/ThemeContext";
import {
  ChatContainer,
  ChatHeader,
  BackButton,
  HeaderInfo,
  HeaderName,
  HeaderStatus,
  HeaderActions,
  MessageList,
  InputContainer,
  InputWrapper,
  ChatInput,
  SendButton,
  AttachmentButton,
  AttachmentMenu,
  MenuItem,
  MenuIcon,
  MenuLabel,
  ReplyPreview,
  ReplyContent,
  ReplySender,
  ReplyText,
} from "./Chat.styles";
import { IconButton } from "../../../../components/ui/IconButton";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  activeChat: string | null;
  session?: SessionData;
  onFileSelect: (file: File) => void;
  onStartCall: (mode: "Audio" | "Video" | "Screen") => void;
  peerOnline?: boolean;
  onBack?: () => void;
  replyingTo?: ChatMessage | null;
  setReplyingTo?: (msg: ChatMessage | null) => void;
  onLoadMore?: () => void;
  isRateLimited?: boolean;
}

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  description: string;
  previewUrl: string | null;
  mediaType: "image" | "video" | "file";
}

export const ChatWindowDefault = ({
  messages,
  onSend,
  activeChat,
  session,
  onFileSelect,
  onStartCall,
  peerOnline,
  onBack,
  replyingTo,
  setReplyingTo,
  onLoadMore,
  isRateLimited,
}: ChatWindowProps) => {
  const { messageLayout } = useTheme();
  const canScreenShare = ChatClient.canScreenShare;
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [input, setInput] = useState("");

  const [showMenu, setShowMenu] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: "image" | "video";
    description?: string;
  } | null>(null);

  const prevHeightRef = useRef(0);
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const prevActiveChatRef = useRef<string | null>(null);
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([]);

  const headerName =
    session?.alias_name ||
    session?.peer_name ||
    (session?.peerEmail ? session.peerEmail.split("@")[0] : undefined) ||
    activeChat ||
    "Chat";
  const avatarToUse = session?.alias_avatar || session?.peer_avatar;
  const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    let active = true;
    if (avatarToUse && !avatarToUse.startsWith("data:")) {
      StorageService.getProfileImage(avatarToUse.replace(/\.jpg$/, "")).then(
        (src) => {
          if (active) setResolvedAvatar(src || undefined);
        },
      );
    } else {
      if (active) setResolvedAvatar(avatarToUse);
    }
    return () => {
      active = false;
    };
  }, [avatarToUse]);

  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const scrollContainer = scrollRef.current;
    const currentHeight = scrollContainer.scrollHeight;
    const newFirstMsgId = messages.length > 0 ? messages[0].id || null : null;

    // Detect Chat Switch
    if (activeChat !== prevActiveChatRef.current) {
      scrollContainer.scrollTop = currentHeight;
      prevActiveChatRef.current = activeChat;
      prevHeightRef.current = currentHeight;
      prevFirstMsgIdRef.current = newFirstMsgId;
      return;
    }

    // Detect History Load (Prepend)
    // We check if height increased AND the first message ID changed (meaning older messages added)
    if (
      prevHeightRef.current > 0 &&
      currentHeight > prevHeightRef.current &&
      newFirstMsgId !== prevFirstMsgIdRef.current
    ) {
      const heightDifference = currentHeight - prevHeightRef.current;
      scrollContainer.scrollTop = heightDifference;
    }
    // Detect New Message (Append) - Auto-scroll if near bottom
    else if (currentHeight > prevHeightRef.current) {
      const isNearBottom =
        scrollContainer.scrollTop + scrollContainer.clientHeight >=
        prevHeightRef.current - 50;
      if (isNearBottom) {
        scrollContainer.scrollTop = currentHeight;
      }
    }

    prevHeightRef.current = currentHeight;
    prevFirstMsgIdRef.current = newFirstMsgId;
  }, [messages, activeChat]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop === 0 && onLoadMore) {
      onLoadMore();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      for (const item of pendingAttachmentsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const createPendingAttachment = (file: File): PendingAttachment => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      description: "",
      previewUrl: isImage || isVideo ? URL.createObjectURL(file) : null,
      mediaType: isImage ? "image" : isVideo ? "video" : "file",
    };
  };

  const addFilesToPending = (files: File[]) => {
    if (!files.length) return;
    setPendingAttachments((prev) => [
      ...prev,
      ...files.map(createPendingAttachment),
    ]);
    setShowMenu(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && activeChat) {
      addFilesToPending(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  const attachments = [
    {
      label: "Document",
      icon: <FileText size={24} />,
      color: "#7f5af0",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      label: "Camera",
      icon: <Camera size={24} />,
      color: "#ff8906",
    },
    {
      label: "Gallery",
      icon: <ImageIcon size={24} />,
      color: "#e53170",
      onClick: () => fileInputRef.current?.click(),
    },
    {
      label: isRecording ? "Stop Voice" : "Voice Message",
      icon: <Mic size={24} />,
      color: "#2cb67d",
      onClick: () => {
        handleRecord();
        setShowMenu(false);
      },
    },
    {
      label: "Live Share",
      icon: <Globe size={24} />,
      color: "#3b82f6",
      onClick: () => setShowPortModal(true),
    },
    {
      label: "Location",
      icon: <MapPin size={24} />,
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

  const handleMediaClick = (
    url: string,
    type: "image" | "video",
    description?: string,
  ) => {
    setSelectedMedia({ url, type, description });
    setMediaModalOpen(true);
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setInput((prev) => prev + emojiData.emoji);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData && e.clipboardData.items) {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFilesToPending(files);
      }
    }
  };

  const handleRenamePendingAttachment = (id: string) => {
    const item = pendingAttachments.find((a) => a.id === id);
    if (!item) return;
    const renamed = window.prompt("Rename file", item.name);
    if (!renamed) return;
    const safeName = renamed.trim();
    if (!safeName) return;
    setPendingAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: safeName } : a)),
    );
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handlePendingAttachmentDescription = (id: string, description: string) => {
    setPendingAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, description } : a)),
    );
  };

  const handleSendMessage = async () => {
    if (!input.trim() && pendingAttachments.length === 0) return;

    if (input.trim()) {
      onSend(input);
    }

    for (const item of pendingAttachments) {
      if (item.description.trim()) {
        onSend(item.description.trim());
      }

      let fileToSend = item.file;
      if (item.name !== item.file.name) {
        fileToSend = new File([item.file], item.name, {
          type: item.file.type,
          lastModified: item.file.lastModified,
        });
      }
      await Promise.resolve(onFileSelect(fileToSend));
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }

    setPendingAttachments([]);
    setInput("");
    setShowEmojiPicker(false);
    setShowGifPicker(false);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredMessages = useMemo(() => {
    if (!normalizedSearch) return messages;

    return messages.filter((msg) => {
      const fields = [
        msg.text || "",
        msg.media?.name || "",
        msg.mediaFilename || "",
        msg.replyTo?.text || "",
        msg.type || "",
      ];
      return fields.some((v) => v.toLowerCase().includes(normalizedSearch));
    });
  }, [messages, normalizedSearch]);

  return (
    <ChatContainer>
      <ChatHeader>
        {onBack && (
          <BackButton onClick={onBack}>
            <ArrowLeft size={24} />
          </BackButton>
        )}

        <Avatar
          src={resolvedAvatar}
          name={headerName}
          size="md"
          status={peerOnline ? "online" : "offline"}
        />

        <HeaderInfo>
          <HeaderName>{headerName}</HeaderName>
          <HeaderStatus isOnline={peerOnline}>
            {peerOnline ? "Online" : "Offline"}
          </HeaderStatus>
        </HeaderInfo>

        <HeaderActions>
          <IconButton
            variant={showSearch ? "primary" : "ghost"}
            size="md"
            onClick={() => {
              setShowSearch((prev) => {
                const next = !prev;
                if (!next) setSearchQuery("");
                return next;
              });
            }}
            title="Search"
          >
            <Search size={20} />
          </IconButton>
          <IconButton
            variant="success"
            size="md"
            onClick={() => onStartCall("Audio")}
            title="Voice Call"
          >
            <Phone size={20} />
          </IconButton>
          <IconButton
            variant="primary"
            size="md"
            onClick={() => onStartCall("Video")}
            title="Video Call"
          >
            <Video size={20} />
          </IconButton>
          {canScreenShare && (
            <IconButton
              variant="ghost"
              size="md"
              onClick={() => onStartCall("Screen")}
              title="Screen Share"
            >
              <Monitor size={20} />
            </IconButton>
          )}
        </HeaderActions>
      </ChatHeader>
      {showSearch && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages, files, links..."
            style={{
              width: "100%",
              height: "38px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#e5e7eb",
              padding: "0 12px",
              outline: "none",
            }}
          />
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        multiple
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      <MessageList ref={scrollRef} onScroll={handleScroll}>
        {filteredMessages.length > 0 ? (
          filteredMessages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={msg}
              onReply={setReplyingTo}
              onMediaClick={handleMediaClick}
              messageLayout={messageLayout}
              senderName={
                msg.sender === "me"
                  ? "You"
                  : session?.alias_name ||
                    session?.peer_name ||
                    (session?.peerEmail
                      ? session.peerEmail.split("@")[0]
                      : undefined) ||
                    "User"
              }
              senderAvatar={msg.sender === "me" ? undefined : resolvedAvatar}
            />
          ))
        ) : (
          <div
            style={{
              textAlign: "center",
              color: "rgba(255,255,255,0.6)",
              padding: "24px 12px",
              fontSize: "0.9rem",
            }}
          >
            No messages match your search.
          </div>
        )}
      </MessageList>

      {replyingTo && (
        <ReplyPreview>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
              minWidth: 0,
            }}
          >
            {replyingTo.thumbnail && (
              <img
                src={
                  replyingTo.thumbnail.startsWith("data:")
                    ? replyingTo.thumbnail
                    : `data:image/jpeg;base64,${replyingTo.thumbnail}`
                }
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "4px",
                  objectFit: "cover",
                }}
              />
            )}
            <ReplyContent>
              <ReplySender>
                Replying to {replyingTo.sender === "me" ? "Me" : "Other"}
              </ReplySender>
              <ReplyText>
                {replyingTo.type === "text"
                  ? replyingTo.text
                  : `[${replyingTo.type}] ${replyingTo.text || ""}`}
              </ReplyText>
            </ReplyContent>
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => setReplyingTo?.(null)}
          >
            <X size={16} />
          </IconButton>
        </ReplyPreview>
      )}

      {showMenu && (
        <AttachmentMenu>
          {attachments.map((item, i) => (
            <MenuItem key={i} onClick={item.onClick}>
              <MenuIcon color={item.color}>{item.icon}</MenuIcon>
              <MenuLabel>{item.label}</MenuLabel>
            </MenuItem>
          ))}
        </AttachmentMenu>
      )}

      {pendingAttachments.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "10px 12px 6px",
            display: "flex",
            gap: "10px",
            overflowX: "auto",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {pendingAttachments.map((item) => (
            <div
              key={item.id}
              style={{
                minWidth: "220px",
                maxWidth: "220px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
                padding: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "6px",
                  marginBottom: "8px",
                }}
              >
                <button
                  onClick={() => handleRenamePendingAttachment(item.id)}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "#d1d5db",
                    border: "none",
                    borderRadius: "6px",
                    width: "26px",
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  title="Rename"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleRemovePendingAttachment(item.id)}
                  style={{
                    background: "rgba(239,68,68,0.18)",
                    color: "#fca5a5",
                    border: "none",
                    borderRadius: "6px",
                    width: "26px",
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div
                style={{
                  height: "130px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "8px",
                }}
              >
                {item.mediaType === "image" && item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : item.mediaType === "video" && item.previewUrl ? (
                  <video
                    src={item.previewUrl}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    muted
                  />
                ) : (
                  <FileText size={28} color="#94a3b8" />
                )}
              </div>

              <div
                style={{
                  color: "#e5e7eb",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: "6px",
                }}
                title={item.name}
              >
                {item.name}
              </div>

              <input
                value={item.description}
                onChange={(e) =>
                  handlePendingAttachmentDescription(item.id, e.target.value)
                }
                placeholder="Add description..."
                style={{
                  width: "100%",
                  height: "30px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e5e7eb",
                  padding: "0 8px",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
            </div>
          ))}
        </div>
      )}

      <InputContainer>
        <AttachmentButton
          active={showMenu}
          onClick={() => setShowMenu(!showMenu)}
        >
          <Plus size={24} />
        </AttachmentButton>

        <InputWrapper isRateLimited={isRateLimited}>
          <ChatInput
            ref={textareaRef}
            rows={1}
            value={isRecording ? "Recording..." : input}
            readOnly={isRecording}
            onPaste={handlePaste}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                (input.trim() || pendingAttachments.length > 0)
              ) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={isRecording ? "" : "Message..."}
          />
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowGifPicker(!showGifPicker);
              setShowEmojiPicker(false);
            }}
            title="GIF"
            style={{ color: "#f59e0b", fontSize: "11px", fontWeight: 700 }}
          >
            GIF
          </IconButton>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowGifPicker(false);
            }}
            title="Emoji"
            style={{ color: "#fbbf24" }}
          >
            <Smile size={24} />
          </IconButton>
        </InputWrapper>

        {input.trim().length > 0 || pendingAttachments.length > 0 ? (
          <SendButton
            onClick={handleSendMessage}
          >
            <Send size={20} />
          </SendButton>
        ) : (
          <SendButton isRecording={isRecording} onClick={handleRecord}>
            <Mic size={20} />
          </SendButton>
        )}
      </InputContainer>

      {showEmojiPicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "transparent",
          }}
          onClick={() => setShowEmojiPicker(false)}
        >
          <div
            style={{
              position: "absolute",
              bottom: "80px",
              right: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              theme={Theme.DARK}
              width={320}
              height={400}
            />
          </div>
        </div>
      )}

      {showGifPicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "transparent",
          }}
          onClick={() => setShowGifPicker(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <GifPicker
              onSelect={(url) => {
                onSend(url);
                setShowGifPicker(false);
              }}
              onClose={() => setShowGifPicker(false)}
            />
          </div>
        </div>
      )}

      <PortShareModal
        isOpen={showPortModal}
        onClose={() => setShowPortModal(false)}
        port={port}
        setPort={setPort}
        onConfirm={() => {
          setShowPortModal(false);
          setShowMenu(false);
        }}
      />

      <MediaModal
        isOpen={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        media={selectedMedia}
      />
    </ChatContainer>
  );
};
