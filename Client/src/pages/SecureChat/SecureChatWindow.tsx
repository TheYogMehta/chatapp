import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
  IonActionSheet,
  IonModal,
  IonInput,
  IonLabel,
} from "@ionic/react";
import {
  add,
  arrowBackOutline,
  documentTextOutline,
  keyOutline,
  lockClosedOutline,
  trashOutline,
  copyOutline,
  shieldCheckmarkOutline,
  paperPlaneOutline,
  searchOutline,
} from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { useSecureChat } from "./hooks/useSecureChat";
import SavePasswordModal from "./SavePasswordModal";
import { AppLockScreen } from "../Home/components/overlays/AppLockScreen";
import { colors } from "../../theme/design-system";
import ChatClient from "../../services/core/ChatClient";
import { platformLaunchService } from "../../services/mfa/platform-launch.service";

export const SecureChatWindow: React.FC = () => {
  const history = useHistory();
  const {
    isUnlocked,
    isSetup,
    unlock,
    setupVault,
    items,
    error: vaultError,
    addItem,
    removeItem,
    decryptItemContent,
    mfaOnboarding,
    clearMfaOnboarding,
  } = useSecureChat();

  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [viewingItem, setViewingItem] = useState<any | null>(null);
  const [vaultMessage, setVaultMessage] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchContentById, setSearchContentById] = useState<
    Record<string, string>
  >({});
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [canOpenOtpLink, setCanOpenOtpLink] = useState(false);
  const MFA_SETUP_SENTINEL = "__setup__";

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!mfaOnboarding?.otpAuthUri) {
        if (active) setCanOpenOtpLink(false);
        return;
      }
      const supported = await platformLaunchService.canOpenOtpAuthUri(
        mfaOnboarding.otpAuthUri,
      );
      if (active) setCanOpenOtpLink(supported);
    };
    check();
    return () => {
      active = false;
    };
  }, [mfaOnboarding]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const uint8 = new Uint8Array(arrayBuffer);
        await addItem("file", uint8, {
          filename: file.name,
          size: file.size,
          type: file.type,
        });
      };
      reader.readAsArrayBuffer(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleViewItem = async (item: any) => {
    try {
      const decrypted = await decryptItemContent(item);
      if (item.type === "password") {
        const data = JSON.parse(decrypted as string);
        setViewingItem({ ...item, content: data });
      } else if (item.type === "text") {
        setViewingItem({ ...item, content: decrypted });
      } else if (item.type === "file") {
        const decryptedBytes = decrypted as Uint8Array;
        const fileBuffer = decryptedBytes.buffer.slice(
          decryptedBytes.byteOffset,
          decryptedBytes.byteOffset + decryptedBytes.byteLength,
        ) as ArrayBuffer;
        const blob = new Blob([fileBuffer], {
          type: item.metadata.type,
        });
        const url = URL.createObjectURL(blob);
        setViewingItem({
          ...item,
          contentUrl: url,
          mimeType: item.metadata.type,
        });
      }
    } catch (e) {
      console.error("Failed to decrypt", e);
      alert("Failed to decrypt item");
    }
  };

  const closeView = () => {
    if (viewingItem?.contentUrl) {
      URL.revokeObjectURL(viewingItem.contentUrl);
    }
    setViewingItem(null);
  };

  const handleStoreMessage = async () => {
    const message = vaultMessage.trim();
    if (!message) return;

    await addItem("text", message, {
      title: message.slice(0, 60),
    });
    setVaultMessage("");
  };

  useEffect(() => {
    let active = true;

    const buildSearchIndex = async () => {
      const index: Record<string, string> = {};

      for (const item of items) {
        const metadataParts = [
          item.metadata?.filename || "",
          item.metadata?.title || "",
          item.metadata?.username || "",
          item.metadata?.email || "",
          item.metadata?.url || "",
          item.type || "",
        ];

        if (item.type === "text" || item.type === "password") {
          try {
            const decrypted = await decryptItemContent(item);
            if (item.type === "text" && typeof decrypted === "string") {
              metadataParts.push(decrypted);
            }
            if (item.type === "password" && typeof decrypted === "string") {
              const parsed = JSON.parse(decrypted);
              metadataParts.push(
                parsed?.url || "",
                parsed?.username || "",
                parsed?.email || "",
                parsed?.password || "",
              );
            }
          } catch (e) {
            console.warn("Search indexing failed for vault item", item.id, e);
          }
        }

        index[item.id] = metadataParts.join(" ").toLowerCase();
      }

      if (active) {
        setSearchContentById(index);
      }
    };

    buildSearchIndex();
    return () => {
      active = false;
    };
  }, [items, decryptItemContent]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => (searchContentById[item.id] || "").includes(q));
  }, [items, searchQuery, searchContentById]);

  if (!isUnlocked) {
    if (pendingPin) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: colors.background.primary,
            padding: "16px",
            paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
            color: colors.text.primary,
            overflowY: "auto",
          }}
        >
          <button
            onClick={() => {
              setPendingPin(null);
              setMfaToken("");
              clearMfaOnboarding();
            }}
            style={{
              alignSelf: "flex-start",
              marginBottom: "12px",
              border: `1px solid ${colors.border.subtle}`,
              background: "transparent",
              color: colors.text.secondary,
              borderRadius: "8px",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Back
          </button>
          <h2 style={{ margin: "0 0 8px 0" }}>Two-Factor Verification</h2>
          <p style={{ margin: "0 0 14px 0", color: colors.text.secondary }}>
            Enter your 6-digit authenticator code to unlock Secure Vault.
          </p>

          {mfaOnboarding?.qrDataUrl && (
            <div
              style={{
                background: colors.surface.primary,
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: "12px",
                padding: "12px",
                marginBottom: "12px",
                textAlign: "center",
              }}
            >
              <img
                src={mfaOnboarding.qrDataUrl}
                alt="MFA QR"
                style={{
                  width: "220px",
                  height: "220px",
                  maxWidth: "100%",
                  borderRadius: "10px",
                }}
              />
            </div>
          )}

          {canOpenOtpLink && mfaOnboarding?.otpAuthUri && (
            <button
              onClick={async () => {
                const opened = await platformLaunchService.openOtpAuthUri(
                  mfaOnboarding.otpAuthUri,
                );
                if (!opened) {
                  alert("Could not open authenticator app. Use QR/manual setup.");
                }
              }}
              style={{
                marginBottom: "12px",
                height: "40px",
                border: "none",
                borderRadius: "10px",
                background: colors.primary.main,
                color: colors.text.inverse,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Open Authenticator App
            </button>
          )}

          {mfaOnboarding && (
            <div
              style={{
                background: colors.surface.primary,
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: "12px",
                padding: "12px",
                marginBottom: "12px",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              <div>Secret (Base32): {mfaOnboarding.secret}</div>
              <div>Account: {mfaOnboarding.accountName}</div>
              <div>Issuer: {mfaOnboarding.issuer}</div>
              <div>Type: Time-based (TOTP)</div>
              <div>Digits: {mfaOnboarding.digits}</div>
              <div>Interval: {mfaOnboarding.period}s</div>
            </div>
          )}

          <input
            value={mfaToken}
            onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Enter 6-digit code"
            inputMode="numeric"
            style={{
              width: "100%",
              height: "44px",
              borderRadius: "10px",
              border: `1px solid ${colors.border.subtle}`,
              background: colors.background.secondary,
              color: colors.text.primary,
              padding: "0 12px",
              marginBottom: "10px",
              outline: "none",
              letterSpacing: "2px",
            }}
          />
          <button
            onClick={async () => {
              const result =
                pendingPin === MFA_SETUP_SENTINEL
                  ? await unlock("", mfaToken, true)
                  : await unlock(pendingPin, mfaToken);
              if (result.ok) {
                setPendingPin(null);
                setMfaToken("");
                clearMfaOnboarding();
              }
            }}
            disabled={mfaToken.length !== 6}
            style={{
              height: "42px",
              border: "none",
              borderRadius: "10px",
              background:
                mfaToken.length === 6
                  ? colors.primary.main
                  : colors.background.tertiary,
              color: mfaToken.length === 6 ? colors.text.inverse : colors.text.secondary,
              cursor: mfaToken.length === 6 ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            Verify & Unlock
          </button>
          {vaultError && (
            <p style={{ marginTop: "10px", color: colors.status.error }}>{vaultError}</p>
          )}
        </div>
      );
    }

    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <AppLockScreen
          mode="input"
          isOverlay={false}
          userEmail={ChatClient.userEmail || ""}
          title={isSetup ? "Secure Vault Locked" : "Setup Vault PIN"}
          description={
            isSetup
              ? "Enter your PIN to access the vault"
              : "Create a PIN for your secure vault"
          }
          onSuccess={(pin) => {
            if (isSetup) {
              unlock(pin || "").then((result) => {
                if (result.requiresMfa) {
                  setPendingPin(pin || "");
                  setMfaToken("");
                }
              });
            } else {
              setupVault(pin || "").then((result) => {
                if (result.requiresMfa) {
                  setPendingPin(MFA_SETUP_SENTINEL);
                  setMfaToken("");
                }
              });
            }
          }}
          onCancel={() => history.push("/home")}
        />
        {vaultError && (
          <div
            style={{
              position: "absolute",
              bottom: "100px",
              width: "100%",
              textAlign: "center",
              color: colors.status.error,
            }}
          >
            <p>{vaultError}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: colors.background.primary,
        position: "relative",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div
        style={{
          background: "rgba(18, 18, 18, 0.95)",
          borderBottom: `1px solid ${colors.border.subtle}`,
          flexShrink: 0,
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => history.push("/home")}
            aria-label="Back"
            style={{
              background: "transparent",
              border: `1px solid ${colors.border.subtle}`,
              color: colors.text.secondary,
              borderRadius: "10px",
              width: "34px",
              height: "34px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <IonIcon icon={arrowBackOutline} style={{ fontSize: "18px" }} />
          </button>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "12px",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
            }}
          >
            <IonIcon
              icon={shieldCheckmarkOutline}
              style={{ color: "white", fontSize: "20px" }}
            />
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                color: colors.text.primary,
                fontSize: "1.1rem",
                fontWeight: 600,
              }}
            >
              Secure Vault
            </h2>
            <p
              style={{
                margin: "2px 0 0 0",
                color: "#10b981",
                fontSize: "0.8rem",
              }}
            >
              Encrypted & Local
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowSearch((prev) => {
              const next = !prev;
              if (!next) setSearchQuery("");
              return next;
            });
          }}
          aria-label="Search vault"
          style={{
            background: showSearch ? "rgba(79,70,229,0.22)" : "transparent",
            border: `1px solid ${colors.border.subtle}`,
            color: colors.text.secondary,
            borderRadius: "10px",
            width: "34px",
            height: "34px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <IonIcon icon={searchOutline} style={{ fontSize: "18px" }} />
        </button>

      </div>
      {showSearch && (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${colors.border.subtle}`,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files, usernames, messages..."
            style={{
              width: "100%",
              height: "38px",
              borderRadius: "10px",
              border: `1px solid ${colors.border.subtle}`,
              background: "rgba(255,255,255,0.04)",
              color: colors.text.primary,
              padding: "0 12px",
              outline: "none",
            }}
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {filteredItems.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              opacity: 0.7,
              marginTop: "-40px",
            }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px",
              }}
            >
              <IonIcon
                icon={lockClosedOutline}
                style={{ fontSize: "32px", color: colors.text.secondary }}
              />
            </div>
            <p
              style={{
                color: colors.text.primary,
                fontSize: "1.1rem",
                fontWeight: 500,
                margin: 0,
              }}
            >
              {searchQuery.trim() ? "No matching items" : "Vault is empty"}
            </p>
            <p
              style={{
                color: colors.text.tertiary,
                fontSize: "0.9rem",
                marginTop: "8px",
              }}
            >
              {searchQuery.trim()
                ? "Try a different search term"
                : "Use the message bar or + to add vault items"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredItems.map((item, index) => (
              <div
                key={item.id}
                onClick={() => handleViewItem(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "16px",
                  borderRadius: "16px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  cursor: "pointer",
                  transition: "transform 0.2s, background-color 0.2s",
                  animation: "slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
                  animationDelay: `${index * 50}ms`,
                  opacity: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    backgroundColor:
                      item.type === "password"
                        ? "rgba(245, 158, 11, 0.15)"
                        : item.type === "text"
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(59, 130, 246, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: "16px",
                    flexShrink: 0,
                  }}
                >
                  <IonIcon
                    icon={item.type === "password" ? keyOutline : documentTextOutline}
                    style={{
                      color:
                        item.type === "password"
                          ? "#fbbf24"
                          : item.type === "text"
                          ? "#34d399"
                          : "#60a5fa",
                      fontSize: "24px",
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      margin: "0 0 4px 0",
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: colors.text.primary,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {item.type === "password"
                      ? item.metadata.username || "Password"
                      : item.type === "text"
                      ? item.metadata.title || "Saved Message"
                      : item.metadata.filename || "File"}
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: colors.text.tertiary }}>
                    {item.type === "password"
                      ? item.metadata.url || "Credential"
                      : item.type === "text"
                      ? "Encrypted Message"
                      : "Encrypted File"}{" "}
                    • {new Date(item.timestamp).toLocaleDateString()}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this item?")) removeItem(item.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: colors.status.error,
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "8px",
                    cursor: "pointer",
                    opacity: 0.7,
                    transition: "opacity 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
                >
                  <IonIcon icon={trashOutline} style={{ fontSize: "20px" }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${colors.border.subtle}`,
          background: "rgba(18, 18, 18, 0.95)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setShowActionSheet(true)}
          aria-label="Add vault item"
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            border: `1px solid ${colors.border.subtle}`,
            background: "rgba(255,255,255,0.04)",
            color: colors.text.secondary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <IonIcon icon={add} style={{ fontSize: "22px" }} />
        </button>

        <input
          value={vaultMessage}
          onChange={(e) => setVaultMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleStoreMessage();
            }
          }}
          placeholder="Save an encrypted message..."
          style={{
            flex: 1,
            height: "42px",
            borderRadius: "999px",
            border: `1px solid ${colors.border.subtle}`,
            background: "rgba(255,255,255,0.04)",
            color: colors.text.primary,
            padding: "0 14px",
            outline: "none",
          }}
        />

        <button
          onClick={handleStoreMessage}
          disabled={!vaultMessage.trim()}
          aria-label="Save message"
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "50%",
            border: "none",
            background: vaultMessage.trim() ? "#4f46e5" : "rgba(79,70,229,0.4)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: vaultMessage.trim() ? "pointer" : "not-allowed",
            flexShrink: 0,
          }}
        >
          <IonIcon icon={paperPlaneOutline} style={{ fontSize: "18px" }} />
        </button>
      </div>

      <IonActionSheet
        isOpen={showActionSheet}
        onDidDismiss={() => setShowActionSheet(false)}
        buttons={[
          {
            text: "Store File",
            icon: documentTextOutline,
            handler: () => fileInputRef.current?.click(),
          },
          {
            text: "Save Password",
            icon: keyOutline,
            handler: () => setShowPasswordModal(true),
          },
          {
            text: "Cancel",
            role: "cancel",
          },
        ]}
      />

      <SavePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSave={async (data) => {
          const content = JSON.stringify(data);
          await addItem("password", content, {
            url: data.url,
            username: data.username,
            email: data.email,
          });
          setShowPasswordModal(false);
        }}
      />

      <IonModal
        isOpen={!!viewingItem}
        onDidDismiss={closeView}
        className="glass-modal"
        style={{
          "--background": "rgba(20, 20, 20, 0.95)",
          "--backdrop-opacity": "0.8",
        } as React.CSSProperties}
      >
        <IonHeader className="ion-no-border">
          <IonToolbar style={{ "--background": "transparent", color: "white" } as React.CSSProperties}>
            <IonTitle>
              {viewingItem?.type === "password"
                ? "Password Details"
                : viewingItem?.type === "text"
                ? "Saved Message"
                : "File Preview"}
            </IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={closeView} color="light">
                Close
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ion-padding" style={{ "--background": "transparent" } as React.CSSProperties}>
          {viewingItem && viewingItem.type === "password" && viewingItem.content && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                marginTop: "10px",
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  padding: "16px",
                  borderRadius: "16px",
                }}
              >
                <IonLabel
                  style={{
                    fontSize: "0.85rem",
                    color: colors.text.tertiary,
                    display: "block",
                    marginBottom: "8px",
                  }}
                >
                  Website URL
                </IonLabel>
                <IonInput
                  readonly
                  value={viewingItem.content.url}
                  style={{ color: "white", "--padding-start": "0" } as React.CSSProperties}
                />
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  padding: "16px",
                  borderRadius: "16px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  <IonLabel
                    style={{
                      fontSize: "0.85rem",
                      color: colors.text.tertiary,
                      display: "block",
                      marginBottom: "8px",
                    }}
                  >
                    Username
                  </IonLabel>
                  <IonInput
                    readonly
                    value={viewingItem.content.username}
                    style={{ color: "white", "--padding-start": "0" } as React.CSSProperties}
                  />
                </div>
                <IonButton
                  fill="clear"
                  onClick={() => navigator.clipboard.writeText(viewingItem.content.username || "")}
                >
                  <IonIcon icon={copyOutline} slot="icon-only" color="primary" />
                </IonButton>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.05)",
                  padding: "16px",
                  borderRadius: "16px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  <IonLabel
                    style={{
                      fontSize: "0.85rem",
                      color: colors.text.tertiary,
                      display: "block",
                      marginBottom: "8px",
                    }}
                  >
                    Password
                  </IonLabel>
                  <IonInput
                    readonly
                    value={viewingItem.content.password}
                    style={{ color: "white", "--padding-start": "0" } as React.CSSProperties}
                  />
                </div>
                <IonButton
                  fill="clear"
                  onClick={() => navigator.clipboard.writeText(viewingItem.content.password || "")}
                >
                  <IonIcon icon={copyOutline} slot="icon-only" color="warning" />
                </IonButton>
              </div>
            </div>
          )}

          {viewingItem && viewingItem.type === "file" && viewingItem.contentUrl && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "80%",
              }}
            >
              {viewingItem.mimeType?.startsWith("image/") ? (
                <img
                  src={viewingItem.contentUrl}
                  alt="preview"
                  style={{ maxWidth: "100%", maxHeight: "400px", borderRadius: "8px" }}
                />
              ) : viewingItem.mimeType?.startsWith("video/") ? (
                <video
                  controls
                  src={viewingItem.contentUrl}
                  style={{ maxWidth: "100%", maxHeight: "400px", borderRadius: "8px" }}
                />
              ) : viewingItem.mimeType?.startsWith("audio/") ? (
                <audio controls src={viewingItem.contentUrl} style={{ width: "100%" }} />
              ) : (
                <div style={{ textAlign: "center" }}>
                  <IonIcon
                    icon={documentTextOutline}
                    style={{
                      fontSize: "64px",
                      color: colors.text.tertiary,
                      marginBottom: "16px",
                    }}
                  />
                  <p style={{ color: colors.text.primary }}>
                    {viewingItem.metadata.filename}
                  </p>
                </div>
              )}

              <IonButton
                href={viewingItem.contentUrl}
                download={viewingItem.metadata.filename}
                expand="block"
                style={{ marginTop: "24px", width: "100%" }}
              >
                Download File
              </IonButton>
            </div>
          )}

          {viewingItem && viewingItem.type === "text" && typeof viewingItem.content === "string" && (
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: "16px",
                padding: "16px",
                marginTop: "12px",
                color: colors.text.primary,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.5,
              }}
            >
              {viewingItem.content}
            </div>
          )}
        </IonContent>
      </IonModal>
    </div>
  );
};
