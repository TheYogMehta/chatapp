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
} from "@ionic/react";
import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

import * as bip39 from "bip39";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
} from "../../services/SafeStorage";

const Setup: React.FC = () => {
  const pageRef = useRef<any>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [hasViewedPassphrase, setHasViewedPassphrase] = useState(false);

  const startSetup = async () => {
    let recoveryPass = await getKeyFromSecureStorage("MASTER_KEY");

    if (!recoveryPass) {
      recoveryPass = bip39.generateMnemonic(128);
      await setKeyFromSecureStorage("MASTER_KEY", recoveryPass);
    }

    setPassphrase(recoveryPass);
    setHasViewedPassphrase(true);
    setIsModalOpen(true);
  };

  const handleCopyToClipboard = async () => {
    if (!passphrase) return;

    await navigator.clipboard.writeText(passphrase);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <IonPage ref={pageRef}>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>ChatApp Setup</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <h2>Welcome to ChatApp</h2>
        <p>
          Before continuing, you must generate a recovery passphrase. This
          passphrase is used to decrypt your data if you move to a different
          device or restore from backup.
        </p>
        <p>
          <strong>Do not lose it.</strong> We cannot recover it for you.
        </p>
      </IonContent>

      <IonFooter>
        <IonToolbar>
          <IonButtons className="ion-justify-content-center">
            <IonButton expand="block" color="secondary" onClick={startSetup}>
              Start Setup
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>

      <IonModal
        isOpen={isModalOpen}
        presentingElement={pageRef.current}
        onDidDismiss={() => setIsModalOpen(false)}
      >
        <IonPage>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Recovery Passphrase</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setIsModalOpen(false)}>
                  Close Setup
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>

          <IonContent className="ion-padding">
            <p>
              This recovery passphrase is required to decrypt your data if you
              reinstall the app or move to another device.
            </p>
            <p>
              Store it somewhere safe. Anyone with this passphrase can access
              your data.
            </p>

            <IonGrid>
              <IonRow>
                {passphrase.split(" ").map((word, idx) => (
                  <IonCol size="6" key={idx}>
                    <IonText
                      style={{
                        display: "block",
                        backgroundColor: "#2a2a2a",
                        color: "white",
                        padding: "10px",
                        borderRadius: "6px",
                        textAlign: "center",
                        marginBottom: "6px",
                        fontWeight: 500,
                      }}
                    >
                      {word}
                    </IonText>
                  </IonCol>
                ))}
              </IonRow>
            </IonGrid>

            <IonButton
              expand="block"
              color="success"
              onClick={handleCopyToClipboard}
              style={{ marginTop: 16 }}
            >
              Copy Passphrase
            </IonButton>

            {isCopied && (
              <IonText
                color="success"
                style={{ display: "block", marginTop: 8 }}
              >
                Copied to clipboard
              </IonText>
            )}

            <IonButton
              expand="block"
              color="primary"
              routerLink="/setup-applock"
              disabled={!hasViewedPassphrase}
              style={{ marginTop: 16 }}
              onClick={() => setIsModalOpen(false)}
            >
              Continue to App Password
            </IonButton>
          </IonContent>
        </IonPage>
      </IonModal>
    </IonPage>
  );
};

export default Setup;
