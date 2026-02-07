import React, { useState, useEffect, useRef } from "react";
import { styles } from "../../Home.styles";
import {
  User,
  PhoneOff,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
  Video,
  VideoOff,
  Monitor,
} from "lucide-react";

interface CallOverlayProps {
  callState: any;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onSwitchStream?: (mode: "Audio" | "Video" | "Screen") => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  callState,
  onAccept,
  onReject,
  onHangup,
  onSwitchStream,
}) => {
  const [duration, setDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let interval: any;
    if (callState?.status === "connected") {
      interval = setInterval(() => setDuration((d) => d + 1), 1000);
      // Auto-enable video UI if type is Video/Screen, but toggle state only if we initiated?
      // Actually callState.type tells us if WE started it as video.
      // But remote stream type is what matters for clear indication?
      // For now, rely on manual toggle or if remote video exists.
    } else {
      setDuration(0);
      setIsMinimized(false);
      setIsVideoEnabled(false);
    }
    return () => clearInterval(interval);
  }, [callState?.status]);

  useEffect(() => {
    if (callState?.remoteVideo && videoContainerRef.current) {
      // Clear previous
      videoContainerRef.current.innerHTML = "";
      videoContainerRef.current.appendChild(callState.remoteVideo);
      callState.remoteVideo.style.width = "100%";
      callState.remoteVideo.style.height = "100%";
      callState.remoteVideo.style.objectFit = "cover";
      callState.remoteVideo.style.borderRadius = "12px";
    }
  }, [callState?.remoteVideo, isMinimized]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    setPosition({
      x: clientX - dragStart.current.x,
      y: clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const toggleVideo = () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    if (onSwitchStream) {
      onSwitchStream(newState ? "Video" : "Audio");
    }
  };

  const shareScreen = () => {
    if (onSwitchStream) {
      onSwitchStream("Screen");
      setIsVideoEnabled(true); // Screen implies video UI
    }
  };

  if (!callState || callState.status === "idle") return null;

  if (callState.status === "ringing" || callState.status === "outgoing") {
    return (
      <div style={styles.modalOverlay}>
        <div
          style={{
            ...styles.glassModal,
            maxWidth: "400px",
            padding: "40px",
            textAlign: "center",
          }}
        >
          <div style={{ ...styles.avatarLarge, margin: "0 auto" }}>
            {callState.remoteSid?.[0]?.toUpperCase() || (
              <User size={64} color="white" />
            )}
          </div>
          <h2 style={{ marginTop: "20px", color: "white" }}>
            {callState.remoteSid
              ? `Peer ${callState.remoteSid.slice(0, 6)}`
              : "Unknown"}
          </h2>
          <p style={{ color: "#94a3b8", marginBottom: "40px" }}>
            {callState.status === "outgoing"
              ? `Calling (${callState.type || "Audio"})...`
              : `Incoming ${callState.type || "Audio"} Call...`}
          </p>

          <div
            style={{ display: "flex", gap: "40px", justifyContent: "center" }}
          >
            {callState.status === "ringing" ? (
              <>
                <button
                  onClick={onAccept}
                  style={{
                    ...styles.iconBtnLarge,
                    backgroundColor: "#22c55e",
                    width: 64,
                    height: 64,
                  }}
                >
                  <PhoneOff size={28} style={{ transform: "rotate(135deg)" }} />
                </button>
                <button
                  onClick={onReject}
                  style={{
                    ...styles.iconBtnLarge,
                    backgroundColor: "#ef4444",
                    width: 64,
                    height: 64,
                  }}
                >
                  <PhoneOff size={28} />
                </button>
              </>
            ) : (
              <button
                onClick={onHangup}
                style={{
                  ...styles.iconBtnLarge,
                  backgroundColor: "#ef4444",
                  width: 64,
                  height: 64,
                }}
              >
                <PhoneOff size={28} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isMinimized) {
    return (
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          width: "200px",
          height: "150px", // Fixed height for video
          backgroundColor: "#1e293b",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          padding: "0",
          zIndex: 1000,
          cursor: "grab",
          border: "1px solid rgba(255,255,255,0.1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{ flex: 1, position: "relative", backgroundColor: "black" }}
        >
          {/* Video Container */}
          <div
            ref={videoContainerRef}
            style={{ width: "100%", height: "100%" }}
          />

          {/* Overlay controls when minimized? kept minimal */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(false);
            }}
            style={{
              position: "absolute",
              top: 5,
              right: 5,
              background: "rgba(0,0,0,0.5)",
              border: "none",
              color: "white",
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.modalOverlay, backgroundColor: "#0f172a" }}>
      <div
        style={{
          position: "absolute",
          top: "40px",
          left: "40px",
          cursor: "pointer",
          color: "white",
          opacity: 0.7,
          zIndex: 10,
        }}
        onClick={() => setIsMinimized(true)}
      >
        <Minimize2 size={32} />
      </div>

      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          height: "100%",
          justifyContent: "space-between",
          paddingBottom: "40px",
        }}
      >
        <div
          style={{
            flex: 1,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Main Video Area */}
          <div
            ref={videoContainerRef}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: "1000px",
              maxHeight: "80vh",
              backgroundColor: "black",
              borderRadius: "16px",
              overflow: "hidden",
              display: callState.remoteVideo ? "block" : "none",
            }}
          />

          {!callState.remoteVideo && (
            <div
              style={{
                width: "150px",
                height: "150px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #a855f7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 60px rgba(99, 102, 241, 0.4)",
              }}
            >
              <span
                style={{ fontSize: "64px", color: "white", fontWeight: "bold" }}
              >
                {callState.remoteSid?.[0]?.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div>
          <h2 style={{ fontSize: "32px", marginBottom: "8px", color: "white" }}>
            Peer {callState.remoteSid?.slice(0, 6)}
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "18px" }}>
            {formatTime(duration)} • Connected
          </p>
        </div>

        <div style={{ display: "flex", gap: "32px", marginTop: "20px" }}>
          <button
            onClick={() => setIsMuted(!isMuted)}
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: isMuted ? "white" : "rgba(255,255,255,0.1)",
              color: isMuted ? "black" : "white",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
          </button>

          <button
            onClick={toggleVideo}
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: isVideoEnabled
                ? "white"
                : "rgba(255,255,255,0.1)",
              color: isVideoEnabled ? "black" : "white",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {isVideoEnabled ? <Video size={28} /> : <VideoOff size={28} />}
          </button>

          <button
            onClick={shareScreen}
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "white",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <Monitor size={28} />
          </button>

          <button
            onClick={onHangup}
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
            }}
          >
            <PhoneOff size={28} />
          </button>
        </div>
      </div>
    </div>
  );
};
