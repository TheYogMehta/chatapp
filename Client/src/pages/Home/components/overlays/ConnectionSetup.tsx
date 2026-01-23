import { styles } from "../../Home.styles";
import ChatClient from "../../../../services/ChatClient";

export const ConnectionSetup = ({
  inviteCode,
  isGenerating,
  joinCode,
  setJoinCode,
  onConnect,
  setIsGenerating,
  isJoining,
}: any) => (
  <div style={styles.setupCard}>
    <h3>Establish Connection</h3>
    <p style={styles.setupSub}>Create a gateway or join an existing peer.</p>
    <button
      onClick={() => {
        setIsGenerating(true);
        ChatClient.createInvite();
      }}
      style={styles.primaryBtn}
      disabled={isGenerating}
    >
      {isGenerating ? "Generating..." : "Generate Invite Code"}
    </button>
    {inviteCode && (
      <div
        style={styles.inviteCodeContainer}
        onClick={() => navigator.clipboard.writeText(inviteCode)}
      >
        <p style={styles.codeLabel}>TAP TO COPY CODE</p>
        <h1 style={styles.codeText}>{inviteCode}</h1>
      </div>
    )}
    <div style={styles.divider}>
      <span>OR JOIN PEER</span>
    </div>
    <div style={styles.joinRow}>
      <input
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value)}
        placeholder="000000"
        maxLength={6}
        style={styles.joinInput}
      />
      <button
        onClick={onConnect}
        style={styles.connectBtn}
        disabled={isJoining}
      >
        {isJoining ? "..." : "Connect"}
      </button>
    </div>
  </div>
);
