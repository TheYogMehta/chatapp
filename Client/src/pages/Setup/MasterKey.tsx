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
} from "../../services/SafeStorage";

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
    setShouldRedirect(true);
    await onComplete();
    setIsModalOpen(false);
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
          Generate a recovery passphrase. This is required to decrypt your data
          if you move devices.
        </p>
        <p>
          <strong>Do not lose it.</strong>
        </p>
      </IonContent>

      <IonFooter>
        <IonToolbar>
          <IonButtons className="ion-justify-content-center">
            <IonButton expand="block" onClick={startSetup}>
              Start Setup
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>

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
            <IonToolbar>
              <IonTitle>Recovery Passphrase</IonTitle>
            </IonToolbar>
          </IonHeader>

          <IonContent className="ion-padding">
            <IonGrid>
              <IonRow>
                {passphrase.split(" ").map((word, i) => (
                  <IonCol size="6" key={i}>
                    <IonText
                      style={{
                        display: "block",
                        background: "#2a2a2a",
                        color: "white",
                        padding: 10,
                        borderRadius: 6,
                        textAlign: "center",
                      }}
                    >
                      {word}
                    </IonText>
                  </IonCol>
                ))}
              </IonRow>
            </IonGrid>

            <IonButton expand="block" onClick={handleCopyToClipboard}>
              Copy Passphrase
            </IonButton>

            {isCopied && <IonText color="success">Copied</IonText>}

            <IonButton expand="block" onClick={finishSetup}>
              Continue
            </IonButton>
          </IonContent>
        </IonPage>
      </IonModal>
    </IonPage>
  );
};

export default SetupMasterKey;
