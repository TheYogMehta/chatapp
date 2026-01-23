import React from "react";
import { styles } from "../../Home.styles";

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
  if (!callState || callState.status === "idle") return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.glassModal, maxWidth: "400px", padding: "40px" }}>
        <div style={styles.avatarLarge}>
          {callState.remoteSid?.[0]?.toUpperCase() || "P"}
        </div>
        <h2 style={{ marginTop: "20px" }}>
          Peer {callState.remoteSid?.slice(0, 6) || "Unknown"}
        </h2>
        <p style={{ color: "#94a3b8", marginBottom: "30px" }}>
          {callState.status === "outgoing" && `${callState.type} calling...`}
          {callState.status === "ringing" &&
            `Incoming ${callState.type} call...`}
          {callState.status === "connected" && "00:00"}
        </p>

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
