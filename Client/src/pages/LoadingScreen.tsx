import React from "react";
import { IonContent, IonPage, IonSpinner } from "@ionic/react";

import { colors } from "../theme/colors";

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
          "--background": colors.background,
        }}
      >
        <h1
          className="title-large"
          style={{ marginBottom: "1rem", color: "#f8fafc" }}
        >
          {title}
        </h1>
        <IonSpinner name="crescent" color="primary" style={{ marginTop: 20 }} />
        <p style={{ marginTop: 12, color: "#94a3b8" }}>{message}</p>
      </IonContent>
    </IonPage>
  );
};

export default LoadingScreen;
