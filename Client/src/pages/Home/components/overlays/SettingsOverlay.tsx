import React, { useState, useEffect } from "react";
import {
  AccountService,
  StoredAccount,
} from "../../../../services/AccountService";
import { deleteDatabase, executeDB } from "../../../../services/sqliteService";
import ChatClient from "../../../../services/ChatClient";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "../../../../services/SafeStorage";
import { AppLockScreen } from "./AppLockScreen";
import { Clipboard } from "@capacitor/clipboard";
import { StorageService } from "../../../../utils/Storage";
import UserAvatar from "../../../../components/UserAvatar";
import { ModalOverlay } from "./Overlay.styles";
import {
  SettingsContainer,
  SettingsSidebar,
  SettingsContent,
  CategoryButton,
  ProfileSection,
  AccountItem,
  DangerZone,
  DangerButton,
  CodeBlock,
  ProfileHeader,
  ProfileInfo,
  EditProfileContainer,
  EditProfileForm,
  EditProfileActions,
  SecuritySection,
  SecurityRow,
  BackupContainer,
  SignOutButton,
} from "./Settings.styles";
import { colors } from "../../../../theme/design-system";
import { ArrowLeft } from "lucide-react";

interface SettingsOverlayProps {
  onClose: () => void;
  currentUserEmail: string | null;
}

type SettingsCategory = "Profile" | "Account" | "Security";

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  onClose,
  currentUserEmail,
}) => {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("Profile");
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [isPinSetup, setIsPinSetup] = useState(false);
  const [tempPin, setTempPin] = useState("");

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
    loadSecuritySettings();
  }, []);

  const loadAccounts = async () => {
    const accs = await AccountService.getAccounts();
    setAccounts(accs);
  };

  const loadSecuritySettings = async () => {
    setAppLockEnabled(true);
  };

  const handleSwitchAccount = async (email: string) => {
    try {
      if (email === currentUserEmail) return;
      await ChatClient.switchAccount(email);
      onClose();
    } catch (e) {
      alert("Failed to switch account: " + e);
    }
  };

  const handleSignOut = async () => {
    if (confirm("Are you sure you want to sign out?")) {
      await ChatClient.logout();
      onClose();
    }
  };

  const handleDeleteAccount = async () => {
    if (
      confirm(
        "ARE YOU SURE? This will delete all your chats and keys permanently from this device.",
      )
    ) {
      if (confirm("Really really sure? This cannot be undone.")) {
        if (currentUserEmail) {
          try {
            const keysToClear = [
              "app_lock_pin",
              "MASTER_KEY",
              "identity_priv",
              "identity_pub",
              "auth_token",
            ];

            for (const keyId of keysToClear) {
              const scopedKey = await AccountService.getStorageKey(
                currentUserEmail,
                keyId,
              );
              await setKeyFromSecureStorage(scopedKey, "");
            }

            await deleteDatabase();
            await AccountService.removeAccount(currentUserEmail);
            await ChatClient.logout();
            onClose();
          } catch (e) {
            console.error("Delete failed", e);
            alert("Failed to delete account data fully.");
          }
        }
      }
    }
  };

  const handleChangePin = () => {
    setShowPinPrompt(true);
    setIsPinSetup(true);
  };

  const handleViewBackup = () => {
    setShowPinPrompt(true);
    setIsPinSetup(false);
  };

  const loadBackupCode = async () => {
    if (!currentUserEmail) return;
    const key = await getKeyFromSecureStorage(
      await AccountService.getStorageKey(currentUserEmail, "MASTER_KEY"),
    );
    setBackupCode(key || "No Master Key Found");
  };

  const handleEditProfile = async () => {
    const currentAcc = accounts.find((a) => a.email === currentUserEmail);
    setEditName(
      currentAcc?.displayName || currentUserEmail?.split("@")[0] || "",
    );

    let avatarSrc = currentAcc?.avatarUrl || null;
    if (
      avatarSrc &&
      !avatarSrc.startsWith("data:") &&
      !avatarSrc.startsWith("http")
    ) {
      avatarSrc = await StorageService.getProfileImage(
        avatarSrc.replace(/\.jpg$/, ""),
      );
    }

    setEditAvatar(avatarSrc);
    setIsEditingProfile(true);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;
            const maxDim = 500;

            if (width > height) {
              if (width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            setEditAvatar(dataUrl);
          };
          img.src = ev.target.result as string;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUserEmail) return;
    try {
      let avatarToSave = editAvatar;
      if (editAvatar && editAvatar.startsWith("data:")) {
        const base64Data = editAvatar.split(",")[1];
        avatarToSave = await StorageService.saveProfileImage(
          base64Data,
          `avatar_${Date.now()}`,
        );
      }

      await executeDB(
        "UPDATE me SET public_name = ?, public_avatar = ?, name_version = name_version + 1, avatar_version = avatar_version + 1 WHERE id = 1",
        [editName, avatarToSave],
      );

      await AccountService.updateProfile(
        currentUserEmail,
        editName,
        avatarToSave || "",
      );

      ChatClient.broadcastProfileUpdate();

      setIsEditingProfile(false);
      await loadAccounts();
    } catch (e) {
      console.error("Failed to save profile", e);
      alert("Failed to save profile");
    }
  };

  return (
    <ModalOverlay>
      <SettingsContainer>
        {/* Left Sidebar */}
        <SettingsSidebar>
          <div
            style={{
              marginBottom: "30px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: colors.text.primary,
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                color: colors.text.primary,
              }}
            >
              Settings
            </h2>
          </div>

          <CategoryButton
            isActive={activeCategory === "Profile"}
            onClick={() => setActiveCategory("Profile")}
          >
            Profile
          </CategoryButton>
          <CategoryButton
            isActive={activeCategory === "Account"}
            onClick={() => setActiveCategory("Account")}
          >
            Account
          </CategoryButton>
          <CategoryButton
            isActive={activeCategory === "Security"}
            onClick={() => setActiveCategory("Security")}
          >
            Security
          </CategoryButton>
        </SettingsSidebar>

        {/* Right Content */}
        <SettingsContent>
          {activeCategory === "Profile" && (
            <div>
              <h3 style={{ marginTop: 0, color: "white" }}>Profile</h3>

              {isEditingProfile ? (
                <EditProfileContainer>
                  <EditProfileForm>
                    <UserAvatar
                      avatarUrl={editAvatar}
                      name={currentUserEmail || "?"}
                      size={80}
                      style={{
                        border: `2px solid ${colors.primary.main}`,
                        flexShrink: 0,
                      }}
                      onClick={() =>
                        document.getElementById("edit-avatar-input")?.click()
                      }
                    >
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,0.6)",
                          color: "white",
                          fontSize: "10px",
                          textAlign: "center",
                          padding: "2px",
                        }}
                      >
                        CHANGE
                      </div>
                    </UserAvatar>
                    <input
                      id="edit-avatar-input"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarSelect}
                      style={{ display: "none" }}
                    />

                    <div style={{ flex: 1, width: "100%" }}>
                      <label
                        style={{
                          display: "block",
                          color: colors.text.secondary,
                          fontSize: "12px",
                          marginBottom: "5px",
                        }}
                      >
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: "6px",
                          background: colors.background.tertiary,
                          border: `1px solid ${colors.border.subtle}`,
                          color: "white",
                          fontSize: "16px",
                          outline: "none",
                        }}
                      />
                    </div>
                  </EditProfileForm>

                  <EditProfileActions>
                    <button
                      onClick={handleSaveProfile}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        background: colors.primary.main,
                        color: "white",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setIsEditingProfile(false)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        background: "transparent",
                        color: colors.text.secondary,
                        border: `1px solid ${colors.border.subtle}`,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </EditProfileActions>
                </EditProfileContainer>
              ) : (
                <ProfileSection>
                  <ProfileHeader>
                    <ProfileInfo>
                      <UserAvatar
                        avatarUrl={(() => {
                          const url = accounts.find(
                            (a) => a.email === currentUserEmail,
                          )?.avatarUrl;
                          console.log("[Settings] Profile Avatar URL:", url);
                          return url;
                        })()}
                        name={currentUserEmail || "?"}
                        size={60}
                      />
                      <div>
                        <div
                          style={{
                            color: "white",
                            fontSize: "18px",
                            fontWeight: 600,
                          }}
                        >
                          {accounts.find((a) => a.email === currentUserEmail)
                            ?.displayName || "No Name Set"}
                        </div>
                        <div
                          style={{
                            color: colors.text.secondary,
                            fontSize: "14px",
                          }}
                        >
                          {currentUserEmail}
                        </div>
                      </div>
                    </ProfileInfo>
                    <button
                      onClick={handleEditProfile}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        background: colors.background.tertiary,
                        color: "white",
                        border: `1px solid ${colors.border.subtle}`,
                        cursor: "pointer",
                      }}
                    >
                      Edit Profile
                    </button>
                  </ProfileHeader>
                </ProfileSection>
              )}
            </div>
          )}
          {activeCategory === "Account" && (
            <div>
              <h3 style={{ marginTop: 0, color: "white" }}>Manage Accounts</h3>
              <div style={{ marginBottom: "30px" }}>
                {accounts.map((acc) => (
                  <AccountItem
                    key={acc.email}
                    isActive={acc.email === currentUserEmail}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <UserAvatar
                        avatarUrl={acc.avatarUrl}
                        name={acc.email}
                        size={32}
                        style={{ background: colors.background.tertiary }}
                      />
                      <span style={{ color: "white" }}>{acc.email}</span>
                      {acc.email === currentUserEmail && (
                        <span
                          style={{
                            fontSize: "12px",
                            color: colors.primary.main,
                            background: colors.primary.subtle,
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          Current
                        </span>
                      )}
                    </div>
                    {acc.email !== currentUserEmail && (
                      <button
                        onClick={() => handleSwitchAccount(acc.email)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "4px",
                          background: colors.primary.main,
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Switch
                      </button>
                    )}
                  </AccountItem>
                ))}
              </div>

              <h3 style={{ color: "white" }}>Danger Zone</h3>
              <DangerZone>
                <SignOutButton onClick={handleSignOut}>Sign Out</SignOutButton>
                <DangerButton onClick={handleDeleteAccount}>
                  Delete Account
                </DangerButton>
              </DangerZone>
            </div>
          )}

          {activeCategory === "Security" && (
            <div>
              <h3 style={{ marginTop: 0, color: "white" }}>Security</h3>

              <SecuritySection>
                <SecurityRow>
                  <div>
                    <div style={{ color: "white", fontWeight: 500 }}>
                      App Lock
                    </div>
                    <div
                      style={{ color: colors.text.secondary, fontSize: "13px" }}
                    >
                      Secured with PIN
                    </div>
                  </div>
                  <button
                    onClick={handleChangePin}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      background: colors.background.tertiary,
                      color: "white",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Change PIN
                  </button>
                </SecurityRow>
              </SecuritySection>

              <SecuritySection>
                <div style={{ color: "white", marginBottom: "10px" }}>
                  Backup Code
                </div>
                {backupCode ? (
                  <BackupContainer>
                    <CodeBlock>
                      {backupCode.split(" ").map((word, i) => (
                        <span
                          key={i}
                          style={{
                            color: "#e5e7eb",
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
                        color: "white",
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
                      WARNING: This key allows full access to your account.
                      Never share it.
                    </p>
                  </BackupContainer>
                ) : (
                  <button
                    onClick={handleViewBackup}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      background: colors.background.tertiary,
                      color: "white",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    View Backup Code
                  </button>
                )}
              </SecuritySection>
            </div>
          )}
        </SettingsContent>
      </SettingsContainer>
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
            setPinInput("");
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
                  setAppLockEnabled(true);
                  setShowPinPrompt(false);
                  setIsPinSetup(false);
                  setTempPin("");
                  setPinInput("");
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
    </ModalOverlay>
  );
};
