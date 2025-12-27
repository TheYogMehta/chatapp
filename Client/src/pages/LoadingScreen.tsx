import React from "react";
import { IonContent, IonPage, IonSpinner } from "@ionic/react";

interface LoadingScreenProps {
  title?: string;
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  title = "ChatApp",
  message = "Loading...",
}) => {
  return (
    <IonPage>
      <IonContent
        fullscreen
        className="ion-padding ion-text-center"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1>{title}</h1>
        <IonSpinner name="crescent" style={{ marginTop: 20 }} />
        <p style={{ marginTop: 12, opacity: 0.7 }}>{message}</p>
      </IonContent>
    </IonPage>
  );
};

export default LoadingScreen;
