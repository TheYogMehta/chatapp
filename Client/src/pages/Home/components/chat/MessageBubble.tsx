import React, { useEffect, useState, useRef } from "react";
import { styles } from "../../Home.styles";
import { ChatMessage } from "../../types";
import ChatClient from "../../../../services/ChatClient";
import { StorageService } from "../../../../utils/Storage";
import {
  Download,
  Save,
  Play,
  Pause,
  FileIcon,
  Loader2,
  Check,
  CheckCheck,
} from "lucide-react";

const AudioPlayer = ({
  src,
  onDownload,
  isDownloaded,
  isDownloading,
  progress,
  isMe,
  onSave,
}: any) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [waveform] = useState(() =>
    Array.from({ length: 40 }, () => Math.random() * 0.8 + 0.2),
  );

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const handleSpeed = () => {
    setSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "100%",
        maxWidth: "240px",
        overflow: "hidden",
      }}
    >
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setDuration(d);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
          style={{ display: "none" }}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            flexShrink: 0,
            backgroundColor: isMe ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {!isDownloaded ? (
            isDownloading ? (
              <span style={{ fontSize: "0.6rem", fontWeight: "bold" }}>
                {Math.round(progress * 100)}%
              </span>
            ) : (
              <Download size={20} onClick={onDownload} />
            )
          ) : isPlaying ? (
            <Pause size={20} fill="currentColor" onClick={togglePlay} />
          ) : (
            <Play size={20} fill="currentColor" onClick={togglePlay} />
          )}
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "2px",
            height: "24px",
            overflow: "hidden",
          }}
        >
          {waveform.map((h, i) => (
            <div
              key={i}
              style={{
                width: "3px",
                flexShrink: 0,
                height: `${h * 100}%`,
                backgroundColor:
                  i / waveform.length < currentTime / duration
                    ? isMe
                      ? "#a5b4fc"
                      : "#64748b"
                    : isMe
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(0,0,0,0.1)",
                borderRadius: "2px",
              }}
            />
          ))}
        </div>

        {isDownloaded && (
          <div
            onClick={handleSpeed}
            style={{
              fontSize: "0.7rem",
              fontWeight: "bold",
              cursor: "pointer",
              width: "24px",
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {speed}x
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.7rem",
          opacity: 0.7,
          paddingLeft: "4px",
          paddingRight: "4px",
        }}
      >
        <span>{isDownloaded ? formatTime(currentTime) : "0:00"}</span>
        <span>
          {isDownloaded
            ? formatTime(duration)
            : isDownloading
            ? "Downloading..."
            : "Voice Note"}
        </span>
      </div>

      {isDownloaded && !isMe && (
        <div
          style={{ position: "absolute", top: 4, right: 4 }}
          onClick={onSave}
        >
          <Save size={14} style={{ opacity: 0.5, cursor: "pointer" }} />
        </div>
      )}
    </div>
  );
};

export const MessageBubble = ({ msg }: { msg: ChatMessage }) => {
  const isMe = msg.sender === "me";
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const [isDecrypted, setIsDecrypted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequestingDownload, setIsRequestingDownload] = useState(false);

  useEffect(() => {
    if (msg.mediaStatus === "downloaded" && msg.mediaFilename && !imageSrc) {
      setIsLoading(true);
      setIsRequestingDownload(false);
      StorageService.getFileSrc(msg.mediaFilename, msg.mediaMime).then(
        (src) => {
          setImageSrc(src);
          setIsDecrypted(true);
          setIsLoading(false);
        },
      );
    } else if (msg.mediaStatus === "downloading") {
      setIsRequestingDownload(false);
    }
  }, [msg.mediaStatus, msg.mediaFilename, msg.mediaMime]);

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
      if (imageSrc || (msg.mediaStatus === "uploading" && msg.tempUrl)) {
        return (
          <div
            style={{
              position: "relative",
              display: "inline-block",
              minWidth: "150px",
              minHeight: "150px",
            }}
          >
            <img
              src={imageSrc || msg.tempUrl}
              alt="attachment"
              style={{
                maxWidth: "100%",
                maxHeight: "300px",
                borderRadius: "12px",
                cursor: "pointer",
                opacity: msg.mediaStatus === "uploading" ? 0.7 : 1,
                display: "block",
              }}
              onClick={() => window.open(imageSrc || msg.tempUrl, "_blank")}
              onError={(e) => {
                console.error(
                  `[MessageBubble] Image load failed. ID=${msg.id} MIME=${
                    msg.mediaMime
                  } LEN=${(imageSrc || msg.tempUrl)?.length || 0}`,
                );
                e.currentTarget.style.display = "none";
              }}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSave();
              }}
              style={{
                position: "absolute",
                bottom: "8px",
                right: "8px",
                backgroundColor: "rgba(0,0,0,0.6)",
                color: "white",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <Save size={16} />
            </button>
            {msg.mediaStatus === "uploading" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Loader2 className="animate-spin" size={24} color="white" />
              </div>
            )}
          </div>
        );
      }

      return (
        <div
          onClick={!isDownloaded ? handleDownload : undefined}
          style={{
            position: "relative",
            minWidth: "200px",
            minHeight: "150px",
            backgroundColor: "#334155",
            borderRadius: "12px",
            overflow: "hidden",
            cursor: !isDownloaded ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {thumbnailSrc && (
            <img
              src={thumbnailSrc}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "blur(10px)",
                transform: "scale(1.1)",
                opacity: 0.6,
              }}
            />
          )}
          <div
            style={{
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {isDownloading ? (
              <div style={{ color: "white", fontWeight: "bold" }}>
                {isRequestingDownload
                  ? "0%"
                  : `${Math.round((msg.mediaProgress || 0) * 100)}%`}
              </div>
            ) : isLoading ? (
              <Loader2 className="animate-spin" size={24} color="white" />
            ) : (
              <>
                <Download size={32} color="white" />
                <span
                  style={{
                    color: "white",
                    fontSize: "0.8rem",
                    fontWeight: "500",
                  }}
                >
                  Download
                </span>
              </>
            )}
          </div>
        </div>
      );
    }

    if (msg.type === "audio") {
      return (
        <div
          style={{
            backgroundColor:
              msg.sender === "me" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.2)",
            padding: "12px 16px",
            borderRadius: "12px",
            position: "relative",
          }}
        >
          <AudioPlayer
            src={imageSrc}
            onDownload={handleDownload}
            isDownloaded={isDownloaded}
            isDownloading={isDownloading}
            progress={msg.mediaProgress || 0}
            isMe={isMe}
            onSave={handleSave}
          />
        </div>
      );
    }

    if (msg.type === "video") {
      if (isDownloaded && imageSrc) {
        return (
          <video
            src={imageSrc}
            controls
            style={{ maxWidth: "100%", borderRadius: "12px" }}
          />
        );
      }
      return (
        <div
          style={{
            position: "relative",
            minWidth: "220px",
            minHeight: "140px",
            backgroundColor: "black",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isDownloading ? (
            <div style={{ color: "white" }}>
              {isRequestingDownload
                ? "0%"
                : `${Math.round((msg.mediaProgress || 0) * 100)}%`}
            </div>
          ) : (
            <button
              onClick={handleDownload}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                border: "none",
                backgroundColor: "rgba(255,255,255,0.2)",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Download size={16} /> <span>Video</span>
            </button>
          )}
        </div>
      );
    }

    if (msg.type === "file") {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            backgroundColor: "rgba(0,0,0,0.2)",
            padding: "12px",
            borderRadius: "12px",
          }}
        >
          <div
            style={{
              padding: "10px",
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: "8px",
            }}
          >
            <FileIcon size={24} />
          </div>
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div
              style={{
                fontWeight: "600",
                fontSize: "0.9rem",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {msg.text || "File"}
            </div>
            <div
              style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "2px" }}
            >
              {isDownloaded ? "Downloaded" : "Attachment"}
            </div>
          </div>
          {isDownloaded ? (
            <button
              onClick={handleSave}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                opacity: 0.8,
                padding: 0,
              }}
            >
              <Save size={20} />
            </button>
          ) : (
            !isDownloading && (
              <button
                onClick={handleDownload}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  opacity: 0.8,
                  padding: 0,
                }}
              >
                <Download size={20} />
              </button>
            )
          )}
          {isDownloading && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 12,
                right: 12,
                height: "3px",
                backgroundColor: "rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  width: `${(msg.mediaProgress || 0) * 100}%`,
                  height: "100%",
                  backgroundColor: "#4ade80",
                }}
              ></div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      style={{
        ...styles.messageWrapper,
        justifyContent: isMe ? "flex-end" : "flex-start",
        display: "flex",
        width: "100%",
        marginBottom: "8px",
      }}
    >
      <div
        style={{
          ...styles.messageBubble,
          backgroundColor: isMe ? "#6366f1" : "#1e293b",
          color: "white",
          maxWidth: "70%",
          padding: "10px 14px",
          borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        {msg.type === "live share port" ? (
          <div style={{ padding: "8px" }}>
            {/* Live Share Port UI (Unchanged) */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.5rem" }}>🌐</span>
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
                backgroundColor: "#3b82f6",
                color: "white",
              }}
            >
              View App
            </button>
          </div>
        ) : msg.type === "text" ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
        ) : (
          renderMediaContent()
        )}

        <div
          style={{
            fontSize: "0.6rem",
            opacity: 0.5,
            textAlign: "right",
            marginTop: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "4px",
          }}
        >
          {(() => {
            const date = new Date(msg.timestamp);
            return isNaN(date.getTime())
              ? "..."
              : date.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
          })()}
          {isMe && (
            <span>
              {msg.status === 2 ? (
                <CheckCheck size={12} />
              ) : (
                <Check size={12} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
