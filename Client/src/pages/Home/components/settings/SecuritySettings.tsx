import React, { useState } from "react";
import { AccountService } from "../../../../services/auth/AccountService";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "../../../../services/storage/SafeStorage";
import { AppLockScreen } from "../overlays/AppLockScreen";
import { Clipboard } from "@capacitor/clipboard";
import {
  SecuritySection,
  SecurityRow,
  BackupContainer,
  CodeBlock,
} from "../overlays/Settings.styles";
import { colors } from "../../../../theme/design-system";

interface SecuritySettingsProps {
  currentUserEmail: string | null;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({
  currentUserEmail,
}) => {
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [isPinSetup, setIsPinSetup] = useState(false);
  const [tempPin, setTempPin] = useState("");

  const handleChangePin = () => {
    setShowPinPrompt(true);
    setIsPinSetup(true);
  };

  const handleViewBackup = () => {
    setShowPinPrompt(true);
    setIsPinSetup(false);
  };

  return (
    <div>
      <h3 style={{ marginTop: 0, color: colors.text.primary }}>Security</h3>

      <SecuritySection>
        <SecurityRow>
          <div>
            <div style={{ color: colors.text.primary, fontWeight: 500 }}>
              App Lock
            </div>
            <div style={{ color: colors.text.secondary, fontSize: "13px" }}>
              Secured with PIN
            </div>
          </div>
          <button
            onClick={handleChangePin}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              background: colors.background.tertiary,
              color: colors.text.primary,
              border: "none",
              cursor: "pointer",
            }}
          >
            Change PIN
          </button>
        </SecurityRow>
      </SecuritySection>

      <SecuritySection>
        <div style={{ color: colors.text.primary, marginBottom: "10px" }}>
          Backup Code
        </div>
        {backupCode ? (
          <BackupContainer>
            <CodeBlock>
              {backupCode.split(" ").map((word, i) => (
                <span
                  key={i}
                  style={{
                    color: colors.text.primary,
                    backgroundColor: colors.background.tertiary,
                    padding: "4px 8px",
                    borderRadius: "4px",
                  }}
                >
                  <span
                    style={{
                      color: colors.text.secondary,
                      marginRight: "4px",
                    }}
                  >
                    {i + 1}.
                  </span>
                  {word}
                </span>
              ))}
            </CodeBlock>
            <button
              onClick={async () => {
                await Clipboard.write({ string: backupCode });
                alert("Copied to clipboard!");
              }}
              style={{
                padding: "10px",
                borderRadius: "6px",
                backgroundColor: colors.primary.main,
                color: colors.text.inverse,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Copy Recovery Phrase
            </button>
            <p
              style={{
                color: colors.status.error,
                fontSize: "12px",
                margin: 0,
              }}
            >
              WARNING: This key allows full access to your account. Never share
              it.
            </p>
          </BackupContainer>
        ) : (
          <button
            onClick={handleViewBackup}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              background: colors.background.tertiary,
              color: colors.text.primary,
              border: "none",
              cursor: "pointer",
            }}
          >
            View Backup Code
          </button>
        )}
      </SecuritySection>
      {showPinPrompt && (
        <AppLockScreen
          userEmail={currentUserEmail}
          mode={!isPinSetup ? "unlock" : "input"}
          title={
            isPinSetup
              ? tempPin
                ? "Confirm PIN"
                : "Set New PIN"
              : "Enter PIN to View"
          }
          description={
            !isPinSetup
              ? "Verify identity to view backup code"
              : "Secure your account"
          }
          onCancel={() => {
            setShowPinPrompt(false);
            setTempPin("");
            setIsPinSetup(false);
          }}
          onSuccess={async (pin) => {
            if (!currentUserEmail) return;
            if (isPinSetup) {
              if (!pin) return;
              if (!tempPin) {
                setTempPin(pin);
              } else {
                if (pin === tempPin) {
                  await setKeyFromSecureStorage(
                    await AccountService.getStorageKey(
                      currentUserEmail,
                      "app_lock_pin",
                    ),
                    pin,
                  );
                  setShowPinPrompt(false);
                  setIsPinSetup(false);
                  setTempPin("");
                  alert("PIN updated successfully");
                } else {
                  alert("PINs do not match. Try again.");
                  setTempPin("");
                }
              }
            } else {
              setShowPinPrompt(false);
              const key = await getKeyFromSecureStorage(
                await AccountService.getStorageKey(
                  currentUserEmail,
                  "MASTER_KEY",
                ),
              );
              setBackupCode(key || "No Master Key Found");
            }
          }}
        />
      )}
    </div>
  );
};
