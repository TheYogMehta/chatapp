import React, { useState, useRef } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonAvatar,
  IonIcon,
  IonFooter,
  IonNote,
} from "@ionic/react";
import { cameraOutline, personOutline, closeCircle } from "ionicons/icons";
import { executeDB } from "../../services/sqliteService";
import { processProfileImage } from "../../utils/imageUtils";

interface Props {
  onComplete: () => void;
}

const ProfileSetup: React.FC<Props> = ({ onComplete }) => {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        const compressed = await processProfileImage(file);
        setAvatar(compressed);
      } catch (err) {
        console.error("Image processing failed:", err);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const removeAvatar = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAvatar(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      await executeDB(
        `INSERT INTO me (id, public_name, public_avatar, name_version, avatar_version)
         VALUES (1, ?, ?, 1, 1)
         ON CONFLICT(id) DO UPDATE SET 
           public_name=excluded.public_name, 
           public_avatar=excluded.public_avatar,
           name_version = name_version + 1,
           avatar_version = avatar_version + 1`,
        [name.trim(), avatar],
      );
      onComplete();
    } catch (err) {
      console.error("Database save failed:", err);
    }
  };
3
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar style={{ "--background": "#1e1f22" }}>
          <IonTitle>Profile Setup</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent
        className="ion-padding ion-text-center"
        style={{ "--background": "#313338" }}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          accept="image/x-png,image/gif,image/jpeg,image/webp"
          onChange={onFileSelected}
        />

        <div style={{ marginTop: "40px", marginBottom: "30px" }}>
          <div
            onClick={handleImagePick}
            style={{
              position: "relative",
              display: "inline-block",
              cursor: "pointer",
            }}
          >
            <IonAvatar
              style={{
                width: "120px",
                height: "120px",
                margin: "0 auto",
                background: "#2b2d31",
                border: "2px solid #1e1f22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt="Profile"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <IonIcon
                  icon={personOutline}
                  style={{ fontSize: "60px", color: "#b5bac1" }}
                />
              )}
            </IonAvatar>

            {/* Camera Icon Overlay */}
            <div
              style={{
                position: "absolute",
                bottom: "5px",
                right: "5px",
                background: "#5865F2",
                borderRadius: "50%",
                padding: "8px",
                display: "flex",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              <IonIcon
                icon={cameraOutline}
                style={{ color: "white", fontSize: "20px" }}
              />
            </div>

            {/* Remove Photo Button */}
            {avatar && (
              <IonIcon
                icon={closeCircle}
                onClick={removeAvatar}
                style={{
                  position: "absolute",
                  top: "-5px",
                  right: "-5px",
                  fontSize: "28px",
                  color: "#ed4245",
                  background: "#313338",
                  borderRadius: "50%",
                }}
              />
            )}
          </div>
          <IonNote
            style={{ display: "block", marginTop: "10px", color: "#b5bac1" }}
          >
            {isProcessing ? "Processing..." : "Tap to upload photo"}
          </IonNote>
        </div>

        <div style={{ maxWidth: "400px", margin: "0 auto" }}>
          <IonItem
            lines="none"
            style={{
              "--background": "#2b2d31",
              "--border-radius": "8px",
              marginBottom: "8px",
            }}
          >
            <IonLabel
              position="stacked"
              style={{ color: "#b5bac1", marginBottom: "8px" }}
            >
              DISPLAY NAME
            </IonLabel>
            <IonInput
              value={name}
              onIonInput={(e) => setName(e.detail.value!)}
              placeholder="What should we call you?"
              style={{ "--color": "#f2f3f5" }}
              maxlength={32}
            />
          </IonItem>
          <IonNote
            style={{
              textAlign: "left",
              display: "block",
              padding: "0 16px",
              color: "#b5bac1",
            }}
          >
            This is how you will appear to other users.
          </IonNote>
        </div>
      </IonContent>

      <IonFooter
        className="ion-no-border"
        style={{ "--background": "#313338" }}
      >
        <div className="ion-padding">
          <IonButton
            expand="block"
            style={{
              "--background": "#5865F2",
              height: "50px",
              fontWeight: "bold",
            }}
            onClick={handleSave}
            disabled={!name.trim() || isProcessing}
          >
            START CHATTING
          </IonButton>
        </div>
      </IonFooter>
    </IonPage>
  );
};

export default ProfileSetup;
