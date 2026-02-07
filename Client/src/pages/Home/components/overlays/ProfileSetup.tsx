import React, { useState, useEffect } from "react";
import { executeDB, queryDB } from "../../../../services/sqliteService";
import { AccountService } from "../../../../services/AccountService";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "../../../../services/SafeStorage";
import { StorageService } from "../../../../utils/Storage";
import { AppLockScreen } from "./AppLockScreen";
import { Clipboard } from "@capacitor/clipboard";
import * as bip39 from "bip39";
import { Buffer } from "buffer";

(window as any).Buffer = Buffer;

interface ProfileSetupProps {
  userEmail: string;
  onComplete: () => void;
}

export const ProfileSetup: React.FC<ProfileSetupProps> = ({
  userEmail,
  onComplete,
}) => {
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [step, setStep] = useState<
    "loading" | "master_key" | "profile" | "pin"
  >("loading");

  // Master Key State
  const [masterKey, setMasterKey] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  // PIN state
  const [tempPin, setTempPin] = useState("");
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    checkProfile();
  }, [userEmail]);

  const checkProfile = async () => {
    try {
      // 1. Check/Generate Master Key
      const storageKey = await AccountService.getStorageKey(
        userEmail,
        "MASTER_KEY",
      );
      let key = await getKeyFromSecureStorage(storageKey);

      if (!key) {
        key = bip39.generateMnemonic(128);
        await setKeyFromSecureStorage(storageKey, key);
        setMasterKey(key);
        setStep("master_key");
        return;
      }

      if (key && !key.includes(" ") && /^[0-9a-fA-F]+$/.test(key)) {
        try {
          const mnemonic = bip39.entropyToMnemonic(key);
          setMasterKey(mnemonic);
          setStep("master_key");
          return;
        } catch (e) {
          console.log("Failed to convert hex to mnemonic", e);
        }
      }

      // 2. Check PIN
      const pinKey = await AccountService.getStorageKey(
        userEmail,
        "app_lock_pin",
      );
      const storedPin = await getKeyFromSecureStorage(pinKey);
      const hasPin = !!storedPin;

      if (!hasPin) {
        setStep("pin");
        return;
      }

      // 3. Check Profile
      const rows = await queryDB(
        "SELECT public_name, public_avatar FROM me WHERE id = 1",
      );
      const hasProfile = rows.length > 0 && rows[0].public_name;

      if (hasProfile) {
        onComplete();
      } else {
        const defaultName = userEmail.split("@")[0];
        setUsername(defaultName);
        setStep("profile");
      }
    } catch (e) {
      console.error("Profile check failed", e);
      setStep("profile");
    }
  };

  const handleMasterKeyNext = async () => {
    try {
      // Ensure we persist the mnemonic (if it was legacy hex) so we don't show this screen again
      const storageKey = await AccountService.getStorageKey(
        userEmail,
        "MASTER_KEY",
      );
      await setKeyFromSecureStorage(storageKey, masterKey);
    } catch (e) {
      console.error("Failed to update master key format", e);
    }
    setStep("pin");
  };

  const handleCopyMasterKey = async () => {
    try {
      await Clipboard.write({ string: masterKey });
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error("Clipboard error", e);
    }
  };

  const handleSaveProfile = async () => {
    try {
      let finalAvatar = avatar;
      if (avatar && avatar.startsWith("data:")) {
        try {
          const identifier = await AccountService.getDbName(userEmail);
          finalAvatar = await StorageService.saveProfileImage(
            avatar.split(",")[1],
            identifier,
          );
        } catch (e) {
          console.error("Failed to save profile image to disk", e);
        }
      }

      const existing = await queryDB(
        "SELECT name_version, avatar_version FROM me WHERE id = 1",
      );

      if (existing.length > 0) {
        await executeDB(
          "UPDATE me SET public_name = ?, public_avatar = ?, name_version = name_version + 1, avatar_version = avatar_version + 1 WHERE id = 1",
          [username, finalAvatar],
        );
      } else {
        await executeDB(
          "INSERT INTO me (id, public_name, public_avatar, name_version, avatar_version) VALUES (1, ?, ?, 1, 1)",
          [username, finalAvatar],
        );
      }

      await AccountService.updateProfile(
        userEmail,
        username,
        finalAvatar || "",
      );

      // Broadcast the update
      const { ChatClient } = await import("../../../../services/ChatClient");
      ChatClient.getInstance().broadcastProfileUpdate();

      onComplete();
    } catch (e) {
      console.error("Failed to save profile", e);
    }
  };

  const handlePinSuccess = async (enteredPin?: string) => {
    if (!enteredPin) return;

    if (!tempPin) {
      // First pass
      setTempPin(enteredPin);
    } else {
      // Confirmation pass
      if (enteredPin === tempPin) {
        try {
          await setKeyFromSecureStorage(
            await AccountService.getStorageKey(userEmail, "app_lock_pin"),
            tempPin,
          );
          setStep("profile");
          const defaultName = userEmail.split("@")[0];
          setUsername(defaultName);
        } catch (e) {
          setSetupError("Failed to save PIN");
          setTempPin("");
        }
      } else {
        setSetupError("PINs did not match. Please try again.");
        setTempPin("");
      }
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setAvatar(ev.target.result as string);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
      e.target.value = "";
    }
  };

  if (step === "loading") return null;

  if (step === "master_key") {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#000",
          zIndex: 3000,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            width: "100%",
            backgroundColor: "#1a1a1a",
            borderRadius: "16px",
            padding: "30px",
            textAlign: "center",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            border: "1px solid #333",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              marginBottom: "20px",
            }}
          >
            🔐
          </div>
          <h2 style={{ color: "white", marginTop: 0, marginBottom: "10px" }}>
            Recovery Passphrase
          </h2>
          <p
            style={{
              color: "#aaa",
              fontSize: "14px",
              lineHeight: "1.5",
              marginBottom: "30px",
            }}
          >
            This is your <strong>Master Key</strong>. You need this to recover
            your account and decrypt your data if you switch devices.
            <br />
            <br />
            <span style={{ color: "#ef4444", fontWeight: "bold" }}>
              Do not lose it. We cannot recover it for you.
            </span>
          </p>

          <div
            style={{
              backgroundColor: "#111",
              padding: "20px",
              borderRadius: "8px",
              marginBottom: "30px",
              border: "1px solid #333",
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "center",
            }}
          >
            {masterKey.split(" ").map((word, i) => (
              <span
                key={i}
                style={{
                  color: "#e5e7eb",
                  fontFamily: "monospace",
                  fontSize: "16px",
                  backgroundColor: "#333",
                  padding: "4px 8px",
                  borderRadius: "4px",
                }}
              >
                <span style={{ color: "#6b7280", marginRight: "4px" }}>
                  {i + 1}.
                </span>
                {word}
              </span>
            ))}
          </div>

          <button
            onClick={handleCopyMasterKey}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "8px",
              backgroundColor: "transparent",
              color: "#3b82f6",
              border: "1px solid #3b82f6",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: "12px",
            }}
          >
            {isCopied ? "Copied!" : "Copy to Clipboard"}
          </button>

          <button
            onClick={handleMasterKeyNext}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "8px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            I have saved it safely
          </button>
        </div>
      </div>
    );
  }

  if (step === "pin") {
    return (
      <AppLockScreen
        mode="input"
        isOverlay={true}
        title={tempPin ? "Confirm App Lock PIN" : "Set App Lock PIN"}
        description={
          setupError ||
          (tempPin
            ? "Re-enter your PIN to confirm"
            : "Create a PIN to secure your account on this device.")
        }
        onSuccess={handlePinSuccess}
        onCancel={() => {
          if (tempPin) {
            setTempPin("");
            setSetupError("");
          } else {
            setSetupError("");
          }
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.9)",
        zIndex: 3000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "400px",
          backgroundColor: "#252525",
          borderRadius: "12px",
          padding: "30px",
          textAlign: "center",
          boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
        }}
      >
        <h2 style={{ color: "white", marginTop: 0 }}>Setup Profile</h2>
        <p style={{ color: "#aaa", fontSize: "14px", marginBottom: "30px" }}>
          Complete your profile to let others recognize you.
        </p>

        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              width: "100px",
              height: "100px",
              borderRadius: "50%",
              backgroundColor: "#333",
              margin: "0 auto 10px",
              backgroundImage: avatar ? `url(${avatar})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "40px",
              color: "#555",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
            }}
            onClick={() => document.getElementById("avatar-input")?.click()}
          >
            {!avatar && userEmail[0].toUpperCase()}
            <label
              htmlFor="avatar-input"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: "rgba(0,0,0,0.6)",
                color: "white",
                fontSize: "10px",
                padding: "4px",
              }}
            >
              EDIT
            </label>
          </div>
          <input
            id="avatar-input"
            type="file"
            accept="image/*"
            onChange={handleAvatarSelect}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ marginBottom: "30px", textAlign: "left" }}>
          <label
            style={{
              display: "block",
              color: "#aaa",
              fontSize: "12px",
              marginBottom: "5px",
            }}
          >
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "white",
              fontSize: "16px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={handleSaveProfile}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "8px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            fontSize: "16px",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: "10px",
          }}
        >
          Finish Setup
        </button>
      </div>
    </div>
  );
};
