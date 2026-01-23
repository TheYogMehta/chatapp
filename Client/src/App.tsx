import React, { useEffect, useState } from "react";
import { Redirect, Route } from "react-router-dom";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";

/* Core CSS required for Ionic components to work properly */
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "@ionic/react/css/padding.css";
import "@ionic/react/css/float-elements.css";
import "@ionic/react/css/text-alignment.css";
import "@ionic/react/css/text-transformation.css";
import "@ionic/react/css/flex-utils.css";
import "@ionic/react/css/display.css";

import LoadingScreen from "./pages/LoadingScreen";
import MasterKeySetup from "./pages/Setup/MasterKey";
import AppLock from "./pages/Setup/AppLock";
import Home from "./pages/Home/Home";

import { AppLockVerify } from "./services/SafeStorage";

setupIonicReact();

const App: React.FC = () => {
  const [hasMasterKey, setHasMasterKey] = useState<boolean | null>(null);
  const [hasAppLock, setHasAppLock] = useState<boolean | null>(null);
  const [isLockEnabled, setIsLockEnabled] = useState<boolean>(false);
  const [sessionUnlocked, setSessionUnlocked] = useState<boolean>(false);

  const syncSecurityState = async () => {
    const lockCheck = await AppLockVerify(null);
    console.log("Check result:", lockCheck);

    if (lockCheck?.needsMasterKey) {
      setHasAppLock(false);
      setHasMasterKey(false);
      setIsLockEnabled(false);
    } else if (lockCheck.needsPin) {
      setHasMasterKey(true);
      setHasAppLock(false);
    } else if (lockCheck?.success) {
      setHasAppLock(true);
      setHasMasterKey(true);
      setSessionUnlocked(true);
      setIsLockEnabled(false);
    } else {
      setHasAppLock(true);
      setHasMasterKey(true);
      setSessionUnlocked(false);
      setIsLockEnabled(true);
    }
  };

  useEffect(() => {
    syncSecurityState();
  }, []);

  // loading state
  if (hasMasterKey === null) {
    return (
      <IonApp>
        <LoadingScreen message="Checking security status..." />
      </IonApp>
    );
  }

  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/">
            {hasMasterKey === false ? (
              <Redirect to="/setup-masterkey" />
            ) : hasAppLock === false ? (
              <Redirect to="/setup-applock" />
            ) : isLockEnabled && !sessionUnlocked ? (
              <Redirect to="/unlock" />
            ) : (
              <Redirect to="/home" />
            )}
          </Route>

          <Route exact path="/setup-masterkey">
            {hasMasterKey ? (
              <Redirect to="/setup-applock" />
            ) : (
              <MasterKeySetup onComplete={syncSecurityState} />
            )}
          </Route>

          <Route exact path="/setup-applock">
            {!hasMasterKey ? (
              <Redirect to="/setup-masterkey" />
            ) : hasAppLock ? (
              <Redirect to="/unlock" />
            ) : (
              <AppLock mode="setup" onSuccess={syncSecurityState} />
            )}
          </Route>

          <Route exact path="/unlock">
            {!hasAppLock ? (
              <Redirect to="/setup-applock" />
            ) : !isLockEnabled || sessionUnlocked ? (
              <Redirect to="/home" />
            ) : (
              <AppLock mode="unlock" onSuccess={syncSecurityState} />
            )}
          </Route>

          <Route exact path="/home">
            {hasMasterKey === false ? (
              <Redirect to="/setup-masterkey" />
            ) : isLockEnabled && !sessionUnlocked ? (
              <Redirect to="/unlock" />
            ) : (
              <Home />
            )}
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
