import { styles } from "../../Home.styles";
import { colors } from "../../../../theme/colors";

interface ConnectionSetupProps {
    targetEmail: string;
    setTargetEmail: (val: string) => void;
    onConnect: () => void;
    isJoining: boolean;
}

export const ConnectionSetup: React.FC<ConnectionSetupProps> = ({
  targetEmail,
  setTargetEmail,
  onConnect,
  isJoining,
}) => (
  <div style={styles.setupCard}>
    <h3 className="title-large" style={{ marginTop: 0 }}>Establish Connection</h3>
    <p style={styles.setupSub}>Enter your friend's email address to start a secure chat.</p>
    
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <input
        type="email"
        value={targetEmail}
        onChange={(e) => setTargetEmail(e.target.value)}
        placeholder="friend@example.com"
        style={{
            ...styles.joinInput,
            textAlign: 'left',
            backgroundColor: colors.surfaceHighlight,
            border: `1px solid ${colors.border}`,
            color: colors.text.primary,
            padding: '16px'
        }}
        onKeyDown={(e) => e.key === 'Enter' && onConnect()}
      />
      
      <button
        onClick={onConnect}
        style={{
            ...styles.primaryBtn,
            opacity: isJoining ? 0.7 : 1,
            cursor: isJoining ? 'wait' : 'pointer'
        }}
        disabled={isJoining || !targetEmail.trim()}
      >
        {isJoining ? "Sending Request..." : "Connect"}
      </button>
    </div>
  </div>
);
