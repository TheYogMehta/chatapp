import React, { useEffect, useState } from "react";
import { styles } from "../../Home.styles";
import { ChatMessage } from "../../types";
import ChatClient from "../../../../services/ChatClient";
import { StorageService } from "../../../../utils/Storage";

export const MessageBubble = ({ msg }: { msg: ChatMessage }) => {
  const isMe = msg.sender === "me";
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (msg.mediaStatus === "downloaded" && msg.mediaFilename) {
      StorageService.getFileSrc(msg.mediaFilename).then(setImageSrc);
    }
  }, [msg.mediaStatus, msg.mediaFilename]);

  const handleDownload = () => {
    if (msg.sid && msg.id) {
       ChatClient.requestDownload(msg.sid, msg.id);
    }
  };

  const handleSave = async () => {
    if (msg.mediaFilename && msg.text) {
       await StorageService.saveToDownloads(msg.mediaFilename, msg.text);
       alert(`Saved to Downloads/chatapp/${msg.text}`);
    } else if (imageSrc) {
       const a = document.createElement('a');
       a.href = imageSrc;
       a.download = msg.text || 'download';
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
    }
  };

  const renderMediaContent = () => {
    const isDownloaded = msg.mediaStatus === "downloaded";
    const isDownloading = msg.mediaStatus === "downloading";
    
    // Thumbnail or Blur Placeholder
    const thumbnailSrc = msg.thumbnail || (msg.media && msg.media.url) || null;

    if (msg.type === "image") {
        if (isDownloaded && imageSrc) {
            return (
                <img 
                  src={imageSrc} 
                  alt="attachment" 
                  style={{ maxWidth: "100%", borderRadius: "8px", cursor: 'pointer' }} 
                  onClick={() => window.open(imageSrc, '_blank')}
                />
            );
        }
        return (
            <div style={{ position: 'relative', minWidth: '200px', minHeight: '150px', backgroundColor: '#333', borderRadius: '8px', overflow: 'hidden' }}>
                {thumbnailSrc && <img src={thumbnailSrc} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(5px)' }} />}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    {isDownloading ? (
                        <div style={{ color: 'white' }}>{(msg.mediaProgress || 0) * 100}%</div>
                    ) : (
                        <button onClick={handleDownload} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>⬇ Download</button>
                    )}
                </div>
            </div>
        );
    }

    if (msg.type === "video") {
         if (isDownloaded && imageSrc) {
             return (
               <video 
                 src={imageSrc} 
                 controls
                 style={{ maxWidth: "100%", borderRadius: "8px" }} 
               />
             );
         }
         return (
             <div style={{ position: 'relative', minWidth: '200px', minHeight: '150px', backgroundColor: '#000', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isDownloading ? (
                        <div style={{ color: 'white' }}>{(msg.mediaProgress || 0) * 100}%</div>
                    ) : (
                        <button onClick={handleDownload} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer' }}>⬇ Video</button>
                    )}
             </div>
         );
    }

    if (msg.type === "file") {
        return (
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                <span style={{ fontSize: '24px' }}>📄</span>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{msg.text || 'File'}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                        {isDownloaded ? "Downloaded" : "Attachment"}
                    </div>
                    {isDownloading && (
                         <div style={{ height: '4px', backgroundColor: '#555', marginTop: '4px', borderRadius: '2px' }}>
                             <div style={{ width: `${(msg.mediaProgress || 0) * 100}%`, height: '100%', backgroundColor: '#4ade80' }}></div>
                         </div>
                    )}
                </div>
                {isDownloaded ? (
                     <button onClick={handleSave} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>💾</button>
                ) : (
                     !isDownloading && <button onClick={handleDownload} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>⬇</button>
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
        ) : (msg.type === "text" ? (
             <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
        ) : renderMediaContent())}
        
        <div
          style={{
            fontSize: "0.6rem",
            opacity: 0.5,
            textAlign: "right",
            marginTop: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "4px"
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
               {msg.status === 2 ? "✓" : "🕒"}
             </span>
          )}
        </div>
      </div>
    </div>
  );
};
