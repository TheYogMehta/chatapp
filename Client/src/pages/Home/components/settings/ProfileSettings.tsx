import React, { useState } from "react";
import {
  AccountService,
  StoredAccount,
} from "../../../../services/auth/AccountService";
import { executeDB } from "../../../../services/storage/sqliteService";
import ChatClient from "../../../../services/core/ChatClient";
import { StorageService } from "../../../../services/storage/StorageService";
import UserAvatar from "../../../../components/UserAvatar";
import {
  ProfileSection,
  ProfileHeader,
  ProfileInfo,
  EditProfileContainer,
  EditProfileForm,
  EditProfileActions,
} from "../overlays/Settings.styles";
import { colors } from "../../../../theme/design-system";

interface ProfileSettingsProps {
  currentUserEmail: string | null;
  accounts: StoredAccount[];
  onReloadAccounts: () => Promise<void>;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  currentUserEmail,
  accounts,
  onReloadAccounts,
}) => {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);

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
      await onReloadAccounts();
    } catch (e) {
      console.error("Failed to save profile", e);
      alert("Failed to save profile");
    }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0, color: colors.text.primary }}>Profile</h3>

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
                  color: colors.text.inverse,
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
                  color: colors.text.primary,
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
                color: colors.text.inverse,
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
                  return url;
                })()}
                name={currentUserEmail || "?"}
                size={60}
              />
              <div>
                <div
                  style={{
                    color: colors.text.primary,
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
                color: colors.text.primary,
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
  );
};
