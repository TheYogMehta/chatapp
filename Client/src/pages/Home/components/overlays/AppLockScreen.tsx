import React, { useState, useEffect } from "react";
import {
  getKeyFromSecureStorage,
  setActiveUser,
} from "../../../../services/SafeStorage";
import {
  AccountService,
  StoredAccount,
} from "../../../../services/AccountService";

interface AppLockScreenProps {
  onSuccess: (pin?: string) => void;
  onCancel?: () => void;
  mode?: "unlock" | "input" | "lock_screen";
  title?: string;
  description?: string;
  isOverlay?: boolean;
  accounts?: StoredAccount[];
  onUnlockAccount?: (email: string) => void;
  onAddAccount?: () => void;
  userEmail?: string | null;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  onSuccess,
  onCancel,
  mode = "unlock",
  title,
  description,
  isOverlay = true,
  accounts,
  onUnlockAccount,
  onAddAccount,
  userEmail,
}) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<StoredAccount | null>(
    null,
  );

  const handleKeyPress = async (val: string) => {
    const newPin = pin + val;
    if (newPin.length <= 6) {
      setPin(newPin);
      setError("");
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError("");
  };

  const handleSubmit = async () => {
    if (mode === "unlock") {
      if (userEmail) await setActiveUser(userEmail);
      const key = userEmail
        ? await AccountService.getStorageKey(userEmail, "app_lock_pin")
        : "app_lock_pin";
      const storedPin = await getKeyFromSecureStorage(key);
      if (storedPin === pin) {
        onSuccess();
      } else {
        setError("Incorrect PIN");
        setPin("");
      }
    } else if (mode === "lock_screen") {
      if (!selectedAccount) return;
      await setActiveUser(selectedAccount.email);
      const key = await AccountService.getStorageKey(
        selectedAccount.email,
        "app_lock_pin",
      );
      const storedPin = await getKeyFromSecureStorage(key);
      if (storedPin === pin) {
        onUnlockAccount?.(selectedAccount.email);
      } else {
        setError("Incorrect PIN");
        setPin("");
      }
    } else {
      onSuccess(pin);
      setPin("");
    }
  };

  useEffect(() => {
    if (pin.length === 6) {
      handleSubmit();
    }
  }, [pin]);

  const containerStyle: React.CSSProperties = isOverlay
    ? {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#111",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
      }
    : {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        width: "100%",
        height: "100%",
      };

  if (mode === "lock_screen" && !selectedAccount) {
    return (
      <div style={containerStyle}>
        <h2 style={{ fontSize: "24px", marginBottom: "30px" }}>
          Select Account
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            width: "100%",
            maxWidth: "320px",
          }}
        >
          {accounts?.map((acc) => (
            <button
              key={acc.email}
              onClick={() => setSelectedAccount(acc)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "15px",
                padding: "15px",
                backgroundColor: "#222",
                border: "1px solid #333",
                borderRadius: "12px",
                color: "white",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  fontWeight: "bold",
                }}
              >
                {acc.displayName?.[0]?.toUpperCase() ||
                  acc.email[0].toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold", fontSize: "16px" }}>
                  {acc.displayName || acc.email.split("@")[0]}
                </div>
                <div style={{ fontSize: "12px", color: "#aaa" }}>
                  {acc.email}
                </div>
              </div>
            </button>
          ))}

          <button
            onClick={onAddAccount}
            style={{
              padding: "15px",
              backgroundColor: "transparent",
              border: "1px dashed #444",
              borderRadius: "12px",
              color: "#aaa",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            + Add another account
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={containerStyle}>
      {(onCancel || (mode === "lock_screen" && selectedAccount)) && (
        <button
          onClick={
            mode === "lock_screen" && selectedAccount
              ? () => {
                  setSelectedAccount(null);
                  setPin("");
                  setError("");
                }
              : onCancel
          }
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            background: "none",
            border: "none",
            color: "#aaa",
            fontSize: "16px",
            cursor: "pointer",
            zIndex: 10000,
          }}
        >
          {mode === "lock_screen" && selectedAccount ? "← Back" : "Cancel"}
        </button>
      )}

      <div style={{ marginBottom: "40px", textAlign: "center" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "10px" }}>
          {title ||
            (mode === "lock_screen" && selectedAccount
              ? `Enter PIN for ${
                  selectedAccount.displayName || selectedAccount.email
                }`
              : "App Locked")}
        </h2>
        <p style={{ color: "#aaa" }}>
          {description || "Enter your PIN to access Chatapp"}
        </p>
      </div>

      <div style={{ display: "flex", gap: "15px", marginBottom: "40px" }}>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              width: "15px",
              height: "15px",
              borderRadius: "50%",
              backgroundColor: i < pin.length ? "#3b82f6" : "#333",
              border: "2px solid #333",
            }}
          />
        ))}
      </div>

      {error && (
        <div style={{ color: "#ef4444", marginBottom: "20px" }}>{error}</div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "20px",
          maxWidth: "300px",
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handleKeyPress(num.toString())}
            style={{
              width: "70px",
              height: "70px",
              borderRadius: "35px",
              border: "1px solid #333",
              background: "transparent",
              color: "white",
              fontSize: "24px",
              cursor: "pointer",
            }}
          >
            {num}
          </button>
        ))}
        <div />
        <button
          onClick={() => handleKeyPress("0")}
          style={{
            width: "70px",
            height: "70px",
            borderRadius: "35px",
            border: "1px solid #333",
            background: "transparent",
            color: "white",
            fontSize: "24px",
            cursor: "pointer",
          }}
        >
          0
        </button>
        <button
          onClick={handleBackspace}
          style={{
            width: "70px",
            height: "70px",
            borderRadius: "35px",
            border: "none",
            background: "transparent",
            color: "#aaa",
            fontSize: "18px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⌫
        </button>
      </div>
    </div>
  );
};
