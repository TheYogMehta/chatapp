import React, { useEffect, useState } from "react";
import { Redirect, Route } from "react-router-dom";
import { IonApp, IonRouterOutlet, setupIonicReact } from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";

setupIonicReact();

// Style
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

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
const toggleDarkMode = (shouldAdd: boolean) => {
  document.body.classList.toggle("dark", shouldAdd);
};
toggleDarkMode(prefersDark.matches);
prefersDark.addEventListener("change", (e) => toggleDarkMode(e.matches));

// Components
import LoadingScreen from "./pages/LoadingScreen";
import { getKeyFromSecureStorage } from "./services/SafeStorage";

// Password Setup
import Setup from "./pages/Setup/setup";
import Home from "./pages/Home/Home";

const App: React.FC = () => {
  const [hasMasterKey, setHasMasterKey] = useState<boolean | null>(null);

  useEffect(() => {
    const checkKey = async () => {
      const key = await getKeyFromSecureStorage("MASTER_KEY");
      setHasMasterKey(!!key);
    };
    checkKey();
  }, []);

  if (hasMasterKey === null) {
    return (
      <IonApp>
        <LoadingScreen message="Initializing setup...." />
      </IonApp>
    );
  }

  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          {!hasMasterKey ? (
            <>
              {/* Setup-only mode */}
              <Route path="/setup" component={Setup} exact />
              {/* Anything else redirects to setup */}
              <Route path="*" render={() => <Redirect to="/setup" />} />
            </>
          ) : (
            <>
              {/* Normal app mode */}
              <Route exact path="/home" component={Home} />
              <Route exact path="/">
                <Redirect to="/home" />
              </Route>
              {/* catch-all */}
              <Route path="*">
                <Redirect to="/home" />
              </Route>
            </>
          )}
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
