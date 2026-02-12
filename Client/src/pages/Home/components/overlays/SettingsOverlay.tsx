import React, { useState, useEffect } from "react";
import {
  AccountService,
  StoredAccount,
} from "../../../../services/auth/AccountService";
import {
  deleteDatabase,
  getMediaFilenames,
  switchDatabase,
} from "../../../../services/storage/sqliteService";
import ChatClient from "../../../../services/core/ChatClient";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
  setActiveUser,
} from "../../../../services/storage/SafeStorage";
import UserAvatar from "../../../../components/UserAvatar";
import { ModalOverlay } from "./Overlay.styles";
import {
  SettingsContainer,
  SettingsSidebar,
  SettingsContent,
  CategoryButton,
  AccountItem,
  DangerZone,
  DangerButton,
  SignOutButton,
  SidebarHeader,
  SidebarTitle,
  BackButton,
} from "./Settings.styles";
import { colors } from "../../../../theme/design-system";
import { ArrowLeft } from "lucide-react";
import { ProfileSettings } from "../settings/ProfileSettings";
import { SecuritySettings } from "../settings/SecuritySettings";
import { AppearanceSettings } from "../settings/AppearanceSettings";
import { StorageService } from "../../../../services/storage/StorageService";

interface SettingsOverlayProps {
  onClose: () => void;
  currentUserEmail: string | null;
}

type SettingsCategory = "Profile" | "Account" | "Security" | "Appearance";

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  onClose,
  currentUserEmail,
}) => {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>("Profile");
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const accs = await AccountService.getAccounts();
    setAccounts(accs);
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
            const dbName = await AccountService.getDbName(currentUserEmail);
            const masterKey = await getKeyFromSecureStorage(
              await AccountService.getStorageKey(
                currentUserEmail,
                "MASTER_KEY",
              ),
            );

            await switchDatabase(dbName, masterKey || undefined);

            const mediaFiles = await getMediaFilenames();
            for (const fileName of mediaFiles) {
              await StorageService.deleteFile(fileName);
            }

            await StorageService.deleteProfileImage(dbName);
            await deleteDatabase(dbName);

            // Ensure we have permission to delete keys
            await setActiveUser(currentUserEmail);

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

  const menuItems: { id: SettingsCategory; label: string }[] = [
    { id: "Profile", label: "Profile" },
    { id: "Appearance", label: "Appearance" },
    { id: "Security", label: "Security" },
    { id: "Account", label: "Data & Storage" },
  ];

  const renderContent = () => {
    switch (activeCategory) {
      case "Appearance":
        return <AppearanceSettings />;
      case "Profile":
        return (
          <ProfileSettings
            currentUserEmail={currentUserEmail}
            accounts={accounts}
            onReloadAccounts={loadAccounts}
          />
        );
      case "Account":
        return (
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
        );
      case "Security":
        return <SecuritySettings currentUserEmail={currentUserEmail} />;
      default:
        return null;
    }
  };

  return (
    <ModalOverlay>
      <SettingsContainer>
        {/* Left Sidebar */}
        <SettingsSidebar>
          <SidebarHeader>
            <BackButton onClick={onClose}>
              <ArrowLeft size={20} />
            </BackButton>
            <SidebarTitle>Settings</SidebarTitle>
          </SidebarHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {menuItems.map((item) => (
              <CategoryButton
                key={item.id}
                isActive={activeCategory === item.id}
                onClick={() => setActiveCategory(item.id)}
              >
                {item.label}
              </CategoryButton>
            ))}
          </div>
        </SettingsSidebar>

        {/* Right Content */}
        <SettingsContent>
          {activeCategory === "Appearance" && <AppearanceSettings />}
          {activeCategory === "Profile" && (
            <ProfileSettings
              currentUserEmail={currentUserEmail}
              accounts={accounts}
              onReloadAccounts={loadAccounts}
            />
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
            <SecuritySettings currentUserEmail={currentUserEmail} />
          )}
        </SettingsContent>
      </SettingsContainer>
    </ModalOverlay>
  );
};
