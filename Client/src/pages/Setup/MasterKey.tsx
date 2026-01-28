import React, { useRef, useState } from "react";
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonFooter,
  IonButton,
  IonButtons,
  IonModal,
  IonText,
  IonGrid,
  IonRow,
  IonCol,
  useIonRouter,
} from "@ionic/react";
import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

import * as bip39 from "bip39";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
  initlock,
} from "../../services/SafeStorage";
import { colors } from "../../theme/colors";

type Props = {
  onComplete: () => Promise<void> | void;
};

const SetupMasterKey: React.FC<Props> = ({ onComplete }) => {
  const pageRef = useRef<any>(null);
  const router = useIonRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const startSetup = async () => {
    let recoveryPass = await getKeyFromSecureStorage("MASTER_KEY");

    if (!recoveryPass) {
      recoveryPass = bip39.generateMnemonic(128);
      await setKeyFromSecureStorage("MASTER_KEY", recoveryPass);
    }

    setPassphrase(recoveryPass);
    setIsModalOpen(true);
  };

  const handleCopyToClipboard = async () => {
    await navigator.clipboard.writeText(passphrase);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const finishSetup = async () => {
    await initlock();
    setShouldRedirect(true);
    await onComplete();
    setIsModalOpen(false);
  };

  return (
    <IonPage ref={pageRef}>
      <IonHeader>
        <IonToolbar style={{ "--background": colors.background, "--border-color": colors.border }}>
          <IonTitle>ChatApp Setup</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding" style={{ "--background": colors.background }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
          <h2 className="title-large" style={{ marginTop: 0 }}>Welcome to GhostTalk</h2>
          <p style={{ color: colors.text.secondary, maxWidth: '300px', textAlign: 'center', marginBottom: '2rem' }}>
            Generate a recovery passphrase. This is required to decrypt your data
            if you move devices.
          </p>
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', marginBottom: '2rem', border: `1px solid ${colors.status.warning}` }}>
            <p style={{ color: colors.status.warning, fontWeight: 600, margin: 0 }}>
              ⚠ Do not lose it.
            </p>
          </div>
          <IonButton expand="block" shape="round" style={{ width: '100%', maxWidth: '300px' }} onClick={startSetup}>
            Start Setup
          </IonButton>
        </div>
      </IonContent>

      <IonModal
        isOpen={isModalOpen}
        onDidDismiss={() => {
          if (shouldRedirect) {
            setShouldRedirect(false);
            setTimeout(() => {
              router.push("/setup-applock", "forward", "replace");
            }, 0);
          }
        }}
      >
        <IonPage>
          <IonHeader>
            <IonToolbar style={{ "--background": colors.surface, "--border-color": colors.border }}>
              <IonTitle>Recovery Passphrase</IonTitle>
            </IonToolbar>
          </IonHeader>

          <IonContent className="ion-padding" style={{ "--background": colors.background }}>
            <div style={{ padding: '1rem' }}>
            <IonGrid>
              <IonRow>
                {passphrase.split(" ").map((word, i) => (
                  <IonCol size="6" key={i}>
                    <IonText
                      style={{
                        display: "block",
                        background: colors.surfaceHighlight,
                        color: colors.text.primary,
                        padding: 12,
                        borderRadius: 8,
                        textAlign: "center",
                        border: `1px solid ${colors.border}`,
                        fontWeight: 500
                      }}
                    >
                      <span style={{ color: colors.text.muted, fontSize: '0.8rem', marginRight: 4 }}>{i+1}.</span> {word}
                    </IonText>
                  </IonCol>
                ))}
              </IonRow>
            </IonGrid>

            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <IonButton expand="block" fill="outline" onClick={handleCopyToClipboard}>
                {isCopied ? "Copied!" : "Copy Passphrase"}
              </IonButton>

              <IonButton expand="block" onClick={finishSetup}>
                I have saved it safely
              </IonButton>
            </div>
            </div>
          </IonContent>
        </IonPage>
      </IonModal>
    </IonPage>
  );
};

export default SetupMasterKey;
