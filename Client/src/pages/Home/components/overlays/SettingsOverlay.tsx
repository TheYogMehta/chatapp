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
  MobileCategoryList,
  MobileCategoryItem,
  MobileHeader,
  MobileTitle,
} from "./Settings.styles";
import { colors } from "../../../../theme/design-system";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ProfileSettings } from "../settings/ProfileSettings";
import { SecuritySettings } from "../settings/SecuritySettings";
import { AppearanceSettings } from "../settings/AppearanceSettings";
import { StorageService } from "../../../../services/storage/StorageService";
import { deleteItemsByOwner } from "../../../../utils/secureStorage";

interface SettingsOverlayProps {
  onClose: () => void;
  currentUserEmail: string | null;
  isMobile?: boolean;
}

type SettingsCategory = "Profile" | "Account" | "Security" | "Appearance";

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  onClose,
  currentUserEmail,
  isMobile,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory | null>(
    isMobile ? null : "Profile",
  );
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    if (!isMobile && !activeCategory) {
      setActiveCategory("Profile");
    }
  }, [isMobile, activeCategory]);

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
    if (isDeletingAccount) return;
    if (
      confirm(
        "ARE YOU SURE? This will delete all your chats and keys permanently from this device.",
      )
    ) {
      if (confirm("Really really sure? This cannot be undone.")) {
        if (currentUserEmail) {
          setIsDeletingAccount(true);
          let deleteFailed = false;
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
            await deleteItemsByOwner(currentUserEmail);
            localStorage.removeItem(`secure_chat_salt_${currentUserEmail}`);

            await setActiveUser(currentUserEmail);

            const keysToClear = [
              "app_lock_pin",
              "MASTER_KEY",
              "vault_mfa_secret",
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

            await deleteDatabase(dbName);
            await AccountService.removeAccount(currentUserEmail);
          } catch (e) {
            deleteFailed = true;
            console.error("Delete failed", e);
            alert("Failed to delete account data fully.");
          } finally {
            try {
              await setActiveUser(null);
              await ChatClient.logout();
            } catch (logoutErr) {
              console.warn("Forced logout after delete failed", logoutErr);
            }
            setIsDeletingAccount(false);
            if (!deleteFailed) {
              onClose();
            }
          }
        }
      }
    }
  };

  const deletingOverlay = isDeletingAccount ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        background: "rgba(5, 10, 22, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          padding: "18px 22px",
          borderRadius: "12px",
          background: colors.surface.primary,
          border: `1px solid ${colors.border.subtle}`,
          color: colors.text.primary,
          minWidth: "220px",
          textAlign: "center",
        }}
      >
        <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
        <div style={{ fontWeight: 600 }}>Deleting account...</div>
        <div style={{ marginTop: "6px", fontSize: "12px", opacity: 0.85 }}>
          Please wait and do not close the app.
        </div>
      </div>
    </div>
  ) : null;

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
            <h3 style={{ marginTop: 0, color: colors.text.primary }}>Manage Accounts</h3>
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
                    <span style={{ color: colors.text.primary }}>{acc.email}</span>
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
                      disabled={isDeletingAccount}
                      onClick={() => handleSwitchAccount(acc.email)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        background: colors.primary.main,
                        color: colors.text.inverse,
                        border: "none",
                        cursor: isDeletingAccount ? "not-allowed" : "pointer",
                        opacity: isDeletingAccount ? 0.6 : 1,
                      }}
                    >
                      Switch
                    </button>
                  )}
                </AccountItem>
              ))}
            </div>

            <h3 style={{ color: colors.text.primary }}>Danger Zone</h3>
            <DangerZone>
              <SignOutButton disabled={isDeletingAccount} onClick={handleSignOut}>
                Sign Out
              </SignOutButton>
              <DangerButton disabled={isDeletingAccount} onClick={handleDeleteAccount}>
                {isDeletingAccount ? "Deleting..." : "Delete Account"}
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

  // Mobile Logic
  if (isMobile) {
    if (!activeCategory) {
      return (
        <ModalOverlay>
          <SettingsContainer>
            <MobileCategoryList>
              <SidebarHeader style={{ padding: "16px", marginBottom: 0 }}>
                <BackButton disabled={isDeletingAccount} onClick={onClose}>
                  <ArrowLeft size={24} />
                </BackButton>
                <SidebarTitle>Settings</SidebarTitle>
              </SidebarHeader>

              {menuItems.map((item) => (
                <MobileCategoryItem
                  key={item.id}
                  disabled={isDeletingAccount}
                  onClick={() => setActiveCategory(item.id)}
                >
                  {item.label}
                  <ChevronRight size={20} color={colors.text.tertiary} />
                </MobileCategoryItem>
              ))}
            </MobileCategoryList>
          </SettingsContainer>
          {deletingOverlay}
        </ModalOverlay>
      );
    }

    return (
      <ModalOverlay>
        <SettingsContainer>
          <MobileHeader>
            <BackButton
              disabled={isDeletingAccount}
              onClick={() => setActiveCategory(null)}
            >
              <ArrowLeft size={24} />
            </BackButton>
            <MobileTitle>
              {menuItems.find((m) => m.id === activeCategory)?.label}
            </MobileTitle>
          </MobileHeader>
          <SettingsContent>{renderContent()}</SettingsContent>
        </SettingsContainer>
        {deletingOverlay}
      </ModalOverlay>
    );
  }

  // Desktop Logic
  return (
    <ModalOverlay>
      <SettingsContainer>
        {/* Left Sidebar */}
        <SettingsSidebar>
          <SidebarHeader>
            <BackButton disabled={isDeletingAccount} onClick={onClose}>
              <ArrowLeft size={20} />
            </BackButton>
            <SidebarTitle>Settings</SidebarTitle>
          </SidebarHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {menuItems.map((item) => (
              <CategoryButton
                key={item.id}
                isActive={activeCategory === item.id}
                disabled={isDeletingAccount}
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
              <h3 style={{ marginTop: 0, color: colors.text.primary }}>Manage Accounts</h3>
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
                      <span style={{ color: colors.text.primary }}>{acc.email}</span>
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
                        disabled={isDeletingAccount}
                        onClick={() => handleSwitchAccount(acc.email)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "4px",
                          background: colors.primary.main,
                          color: colors.text.inverse,
                          border: "none",
                          cursor: isDeletingAccount ? "not-allowed" : "pointer",
                          opacity: isDeletingAccount ? 0.6 : 1,
                        }}
                      >
                        Switch
                      </button>
                    )}
                  </AccountItem>
                ))}
              </div>

              <h3 style={{ color: colors.text.primary }}>Danger Zone</h3>
              <DangerZone>
                <SignOutButton disabled={isDeletingAccount} onClick={handleSignOut}>
                  Sign Out
                </SignOutButton>
                <DangerButton disabled={isDeletingAccount} onClick={handleDeleteAccount}>
                  {isDeletingAccount ? "Deleting..." : "Delete Account"}
                </DangerButton>
              </DangerZone>
            </div>
          )}

          {activeCategory === "Security" && (
            <SecuritySettings currentUserEmail={currentUserEmail} />
          )}
        </SettingsContent>
      </SettingsContainer>
      {deletingOverlay}
    </ModalOverlay>
  );
};
