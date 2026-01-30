import React, { useState, useEffect } from "react";
import { styles } from "../../Home.styles";
import { User } from "lucide-react";

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

  useEffect(() => {
    let interval: any;
    if (callState?.status === "connected") {
      interval = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      setDuration(0);
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

  if (!callState || callState.status === "idle") return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.glassModal, maxWidth: "400px", padding: "40px" }}>
        <div style={styles.avatarLarge}>
          {callState.remoteSid?.[0]?.toUpperCase() || <User size={64} color="white" />}
        </div>
        <h2 style={{ marginTop: "20px" }}>
          Peer {callState.remoteSid?.slice(0, 6) || "Unknown"}
        </h2>
        <div style={{ color: "#94a3b8", marginBottom: "30px" }}>
          {callState.status === "outgoing" && `${callState.type} calling...`}
          {callState.status === "ringing" &&
            `Incoming ${callState.type} call...`}
          {callState.status === "connected" && formatTime(duration)}

          {/* Debug Info */}
          {callState?.iceStatus && (
            <span style={{ display: 'block', fontSize: '10px', marginTop: 10, color: '#aaa' }}>
              Status: {callState.iceStatus}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "20px", justifyContent: "center" }}>
          {callState.status === "ringing" ? (
            <>
              <button
                onClick={onAccept}
                style={{ ...styles.iconBtnLarge, backgroundColor: "#22c55e" }}
              >
                ✔
              </button>
              <button
                onClick={onReject}
                style={{ ...styles.iconBtnLarge, backgroundColor: "#ef4444" }}
              >
                ✖
              </button>
            </>
          ) : (
            <button
              onClick={onHangup}
              style={{
                ...styles.iconBtnLarge,
                backgroundColor: "#ef4444",
                width: "100%",
              }}
            >
              End Call
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
