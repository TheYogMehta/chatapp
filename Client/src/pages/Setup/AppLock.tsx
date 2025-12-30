import React, { useEffect, useState } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonGrid,
  IonRow,
  IonCol,
  IonText,
  IonItem,
  IonLabel,
  IonToggle,
} from "@ionic/react";
import {
  getKeyFromSecureStorage,
  setKeyFromSecureStorage,
  AppLockVerify,
  AppLock,
  ToggleAppLock,
} from "../../services/SafeStorage";

type Mode = "setup" | "unlock";

interface Props {
  mode: Mode;
  onSuccess: () => void;
}

const AppLockScreen: React.FC<Props> = ({ mode, onSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(mode === "setup" ? 1 : 2);
  const [length, setLength] = useState<4 | 6 | null>(null);
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isLockEnabled, setIsLockEnabled] = useState(true);

  // Lockout logic
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const init = async () => {
      const savedLen = await getKeyFromSecureStorage("APP_LOCK_LEN");
      setLength(savedLen ? (Number(savedLen) as 4 | 6) : 4);
      const res = await AppLockVerify(null);
      if (res.isLockedOut) {
        setLockoutUntil(Date.now() + res.remainingMs);
        setSecondsLeft(Math.ceil(res.remainingMs / 1000));
      }
    };
    init();
  }, []);

  useEffect(() => {
    let timer: any;
    if (secondsLeft > 0) {
      timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    } else if (secondsLeft === 0 && lockoutUntil) {
      setLockoutUntil(null);
    }
    return () => clearInterval(timer);
  }, [secondsLeft, lockoutUntil]);

  const proceed = async (inputCode: string) => {
    setError("");
    if (mode === "setup") {
      if (step === 2) {
        setStep(3);
      } else if (step === 3) {
        if (inputCode !== code) {
          // compare confirm vs code
          setError("PINs do not match");
          setConfirm("");
        } else {
          const res = await AppLock(inputCode, null);
          if (res.success) {
            await setKeyFromSecureStorage("APP_LOCK_LEN", String(length));
            setStep(4);
          }
        }
      }
    } else {
      const res = await AppLockVerify(inputCode);
      if (res.success) {
        onSuccess();
      } else if (res.isLockedOut) {
        setLockoutUntil(Date.now() + res.remainingMs);
        setSecondsLeft(Math.ceil(res.remainingMs / 1000));
        setCode("");
      } else {
        setError(
          `Incorrect PIN. ${res.attempts ? `Attempt ${res.attempts}` : ""}`
        );
        setCode("");
      }
    }
  };

  const handleInput = (val: string | number) => {
    if (lockoutUntil) return;

    if (val === "←") {
      step === 3
        ? setConfirm((c) => c.slice(0, -1))
        : setCode((c) => c.slice(0, -1));
      return;
    }

    const current = step === 3 ? confirm : code;
    if (current.length < length!) {
      const nextVal = current + val;
      step === 3 ? setConfirm(nextVal) : setCode(nextVal);

      // Auto-submit when length reached
      if (nextVal.length === length) {
        // Small delay so user sees the last dot fill
        setTimeout(() => proceed(nextVal), 150);
      }
    }
  };

  const finalizeSetup = async () => {
    await ToggleAppLock(isLockEnabled);
    onSuccess();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>
            {mode === "setup" ? "Security Setup" : "Unlock App"}
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding ion-text-center">
        {lockoutUntil ? (
          <div style={{ marginTop: "60px" }}>
            <IonText color="danger">
              <h1>Temporarily Locked</h1>
            </IonText>
            <p>Too many failed attempts.</p>
            <p>
              Try again in:{" "}
              <strong>
                {Math.floor(secondsLeft / 60)}m {secondsLeft % 60}s
              </strong>
            </p>
          </div>
        ) : step === 1 ? (
          <div style={{ marginTop: "40px" }}>
            <h2>Choose PIN Length</h2>
            <IonButton
              expand="block"
              onClick={() => {
                setLength(4);
                setStep(2);
              }}
            >
              4 Digits
            </IonButton>
            <IonButton
              expand="block"
              fill="outline"
              onClick={() => {
                setLength(6);
                setStep(2);
              }}
            >
              6 Digits
            </IonButton>
          </div>
        ) : step === 4 ? (
          <div style={{ marginTop: "40px" }}>
            <IonText color="success">
              <h1>PIN Created!</h1>
            </IonText>
            <IonItem lines="none" className="ion-margin-top">
              <IonLabel>Require PIN on startup</IonLabel>
              <IonToggle
                checked={isLockEnabled}
                onIonChange={(e) => setIsLockEnabled(e.detail.checked)}
              />
            </IonItem>
            <IonButton
              expand="block"
              onClick={finalizeSetup}
              style={{ marginTop: "40px" }}
            >
              Finish
            </IonButton>
          </div>
        ) : (
          <div style={{ marginTop: "40px" }}>
            <h2>{step === 3 ? "Confirm your PIN" : "Enter your PIN"}</h2>
            <div
              style={{
                fontSize: "32px",
                letterSpacing: "12px",
                margin: "30px 0",
              }}
            >
              {"●".repeat(step === 3 ? confirm.length : code.length)}
              <span style={{ color: "#ccc" }}>
                {"○".repeat(
                  length! - (step === 3 ? confirm.length : code.length)
                )}
              </span>
            </div>

            <IonGrid style={{ maxWidth: "280px" }}>
              <IonRow>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "←"].map((val, i) => (
                  <IonCol size="4" key={i}>
                    <IonButton
                      expand="block"
                      fill="clear"
                      size="large"
                      onClick={() => val !== "" && handleInput(val)}
                    >
                      {val}
                    </IonButton>
                  </IonCol>
                ))}
              </IonRow>
            </IonGrid>

            {error && (
              <IonText color="danger">
                <p>{error}</p>
              </IonText>
            )}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default AppLockScreen;
