import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import { StorageService } from "../../../../utils/Storage";
import { MessageBubble } from "./MessageBubble";
import { PortShareModal } from "./PortShareModal";
import { MediaModal } from "./MediaModal";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import {
  Send,
  Mic,
  Plus,
  Image as ImageIcon,
  Camera,
  FileText,
  MapPin,
  Headphones,
  Globe,
  Phone,
  ArrowLeft,
  X,
  Video,
  Gift,
  Smile,
} from "lucide-react";
import { GifPicker } from "../../../../components/GifPicker";
import { ChatMessage, SessionData } from "../../types";
import { Avatar } from "../../../../components/ui/Avatar";
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
  onStartCall: (mode: "Audio" | "Video") => void;
  peerOnline?: boolean;
  onBack?: () => void;
  replyingTo?: ChatMessage | null;
  setReplyingTo?: (msg: ChatMessage | null) => void;
  onLoadMore?: () => void;
  isRateLimited?: boolean;
}

export const ChatWindow = ({
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [input, setInput] = useState("");

  const [showMenu, setShowMenu] = useState(false);
  const [showPortModal, setShowPortModal] = useState(false);
  const [port, setPort] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: "image" | "video";
    description?: string;
  } | null>(null);

  const prevHeightRef = useRef(0);
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const prevActiveChatRef = useRef<string | null>(null);

  const headerName =
    session?.alias_name ||
    session?.peer_name ||
    session?.peerEmail ||
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeChat) {
      const file = e.target.files[0];
      if (onFileSelect) {
        onFileSelect(file);
      }
      setShowMenu(false);
    }
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
      label: "Audio",
      icon: <Headphones size={24} />,
      color: "#2cb67d",
      onClick: () => fileInputRef.current?.click(),
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
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            if (onFileSelect) {
              onFileSelect(file);
            }
            return;
          }
        }
      }
    }
  };

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
        </HeaderActions>
      </ChatHeader>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      <MessageList ref={scrollRef} onScroll={handleScroll}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            onReply={setReplyingTo}
            onMediaClick={handleMediaClick}
          />
        ))}
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
              if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                e.preventDefault();
                onSend(input);
                setInput("");
                setShowEmojiPicker(false);
                setShowGifPicker(false);
              }
            }}
            placeholder={isRecording ? "" : "Message..."}
          />
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
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowGifPicker(!showGifPicker);
              setShowEmojiPicker(false);
            }}
            title="GIFs"
            style={{ color: "#a78bfa" }}
          >
            <Gift size={24} />
          </IconButton>
        </InputWrapper>

        {input.trim().length > 0 ? (
          <SendButton
            onClick={() => {
              onSend(input);
              setInput("");
              setShowEmojiPicker(false);
              setShowGifPicker(false);
            }}
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
            position: "absolute",
            bottom: "80px",
            right: "20px",
            zIndex: 1000,
          }}
        >
          <EmojiPicker
            onEmojiClick={onEmojiClick}
            theme={Theme.DARK}
            width={320}
            height={400}
          />
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

      {showGifPicker && (
        <GifPicker
          onSelect={(url) => {
            onSend(url);
            setShowGifPicker(false);
          }}
          onClose={() => setShowGifPicker(false)}
        />
      )}
    </ChatContainer>
  );
};
