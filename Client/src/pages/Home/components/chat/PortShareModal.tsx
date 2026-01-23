import React from "react";
import { styles } from "../../Home.styles";

interface PortShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (port: number) => void;
  port: string;
  setPort: (val: string) => void;
}

export const PortShareModal: React.FC<PortShareModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  port,
  setPort,
}) => {
  if (!isOpen) return null;

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.glassModal}>
        <h3>Share Local Port</h3>
        <p>Forward a local web app (e.g., 3000) to this peer.</p>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="e.g. 3000"
          style={styles.joinInput}
        />
        <div style={styles.modalButtons}>
          <button
            onClick={() => onConfirm(parseInt(port))}
            style={styles.primaryBtn}
          >
            Start Sharing
          </button>
          <button onClick={onClose} style={styles.cancelBtn}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
