import { styles } from "../../Home.styles";
import ChatClient from "../../../../services/ChatClient";

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
          <h3>Waiting for Peer...</h3>
          <p>Establishing secure handshake.</p>
          <button onClick={() => setIsWaiting(false)} style={styles.cancelBtn}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <h3>Peer Request</h3>
          <p>Accept link from {inboundReq?.sid.slice(0, 8)}?</p>
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
              onClick={() => setInboundReq(null)}
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
