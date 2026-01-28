import { styles } from "../../Home.styles";
import ChatClient from "../../../../services/ChatClient";
import { colors } from "../../../../theme/colors";

export const RequestModal = ({
  inboundReq,
  isWaiting,
  setInboundReq,
  setIsWaiting,
}: any) => (
  <div style={styles.modalOverlay}>
    <div style={styles.glassModal}>
      {isWaiting ? (
        <>
          <div style={styles.spinner}></div>
          <h3 style={{ color: colors.text.primary, marginTop: 0 }}>Waiting for Peer...</h3>
          <p style={{ color: colors.text.secondary }}>Establishing secure handshake.</p>
          <button onClick={() => setIsWaiting(false)} style={styles.cancelBtn}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <h3 style={{ color: colors.text.primary, marginTop: 0 }}>Peer Request</h3>
          <p style={{ color: colors.text.primary }}>
            Request from{" "}
            <span style={{ color: colors.primary, fontWeight: 600 }}>
              {(inboundReq as any).email || "Unknown"}
            </span>
          </p>
          <p style={{ fontSize: "0.8em", color: colors.text.muted }}>
            Session ID: {inboundReq?.sid.slice(0, 8)}
          </p>
          <div style={styles.modalButtons}>
            <button
              onClick={async () => {
                await ChatClient.acceptFriend(
                  inboundReq!.sid,
                  inboundReq!.publicKey,
                );
                setInboundReq(null);
              }}
              style={styles.primaryBtn}
            >
              Accept
            </button>
            <button
              onClick={() => {
                ChatClient.denyFriend(inboundReq!.sid);
                setInboundReq(null);
              }}
              style={styles.cancelBtn}
            >
              Decline
            </button>
          </div>
        </>
      )}
    </div>
  </div>
);
