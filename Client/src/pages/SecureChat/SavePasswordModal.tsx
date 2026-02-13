import React, { useState } from "react";
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
} from "@ionic/react";
import { diceOutline, closeOutline, checkmarkOutline } from "ionicons/icons";
import { generateRandomPassword } from "../../utils/crypto";
import { colors } from "../../theme/design-system";

interface SavePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

const SavePasswordModal: React.FC<SavePasswordModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleGenerate = () => {
    setPassword(generateRandomPassword(16));
  };

  const handleSave = () => {
    if (!password || (!username && !email)) {
      // Basic validation
      alert("Please enter password and at least a username or email");
      return;
    }

    onSave({
      url,
      username,
      email,
      password,
    });
    reset();
  };

  const reset = () => {
    setUrl("");
    setUsername("");
    setEmail("");
    setPassword("");
    onClose();
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={reset}
      style={
        {
          "--background": colors.background.secondary,
          "--backdrop-opacity": "0.7",
        } as React.CSSProperties
      }
    >
      <IonHeader>
        <IonToolbar
          style={
            {
              "--background": colors.background.secondary,
              color: colors.text.primary,
              borderBottom: `1px solid ${colors.border.subtle}`,
              paddingTop: "env(safe-area-inset-top, 0px)",
            } as React.CSSProperties
          }
        >
          <IonTitle style={{ color: colors.text.primary }}>Save Password</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={reset} style={{ color: colors.text.secondary }}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent
        className="ion-padding"
        style={
          {
            "--background": colors.background.secondary,
            color: colors.text.primary,
          } as React.CSSProperties
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {[
            {
              label: "Website URL",
              value: url,
              setValue: setUrl,
              placeholder: "https://example.com",
              type: "text",
            },
            {
              label: "Username",
              value: username,
              setValue: setUsername,
              placeholder: "Username",
              type: "text",
            },
            {
              label: "Email",
              value: email,
              setValue: setEmail,
              placeholder: "Email",
              type: "email",
            },
          ].map((field) => (
            <label
              key={field.label}
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <span
                style={{ fontSize: "12px", color: colors.text.tertiary }}
              >
                {field.label}
              </span>
              <input
                value={field.value}
                type={field.type}
                placeholder={field.placeholder}
                onChange={(e) => field.setValue(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: `1px solid ${colors.border.subtle}`,
                  background: colors.background.tertiary,
                  color: colors.text.primary,
                  outline: "none",
                }}
              />
            </label>
          ))}

          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: colors.text.tertiary }}>
              Password
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={password}
                type="text"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "10px",
                  border: `1px solid ${colors.border.subtle}`,
                  background: colors.background.tertiary,
                  color: colors.text.primary,
                  outline: "none",
                }}
              />
              <IonButton
                onClick={handleGenerate}
                fill="clear"
                title="Generate Random Password"
                style={{
                  border: `1px solid ${colors.border.subtle}`,
                  borderRadius: "10px",
                  color: colors.text.secondary,
                }}
              >
                <IonIcon icon={diceOutline} slot="icon-only" />
              </IonButton>
            </div>
          </label>

          <IonButton
            expand="block"
            onClick={handleSave}
            style={
              {
                "--background": colors.primary.main,
                "--color": colors.text.inverse,
                marginTop: "8px",
              } as React.CSSProperties
            }
          >
            <IonIcon icon={checkmarkOutline} slot="start" />
            Save Credentials
          </IonButton>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default SavePasswordModal;
