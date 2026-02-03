import React, { useState, useEffect, useRef } from "react";
import { styles } from "../../Home.styles";
import {
  User,
  PhoneOff,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
} from "lucide-react";

interface CallOverlayProps {
  callState: any;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  callState,
  onAccept,
  onReject,
  onHangup,
}) => {
  const [duration, setDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let interval: any;
    if (callState?.status === "connected") {
      interval = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      setDuration(0);
      setIsMinimized(false);
    }
    return () => clearInterval(interval);
  }, [callState?.status]);

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
              ? "Calling..."
              : "Incoming Call..."}
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
          backgroundColor: "#1e293b",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          padding: "16px",
          zIndex: 1000,
          cursor: "grab",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <span
            style={{
              color: "#22c55e",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            ● {formatTime(duration)}
          </span>
          <button
            onClick={() => setIsMinimized(false)}
            style={{
              background: "none",
              border: "none",
              color: "white",
              cursor: "pointer",
            }}
          >
            <Maximize2 size={16} />
          </button>
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            onClick={() => setIsMuted(!isMuted)}
            style={{
              background: isMuted ? "white" : "rgba(255,255,255,0.1)",
              color: isMuted ? "black" : "white",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button
            onClick={onHangup}
            style={{
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PhoneOff size={16} />
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
          gap: "40px",
        }}
      >
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

        <div>
          <h2 style={{ fontSize: "32px", marginBottom: "8px", color: "white" }}>
            Peer {callState.remoteSid?.slice(0, 6)}
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "18px" }}>
            {formatTime(duration)} • Connected
          </p>
        </div>

        <div style={{ display: "flex", gap: "32px", marginTop: "40px" }}>
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
