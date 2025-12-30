import React, { useState } from "react";

const AuthScreen = ({ onPasscodeSetup }) => {
  const [step, setStep] = useState(1); // Step 1: Select Passcode Length, Step 2: Setup Passcode, Step 3: Confirm Passcode
  const [passcodeLength, setPasscodeLength] = useState(null); // 4 or 6 digit selection
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [error, setError] = useState("");

  // Step 1: Handle passcode length selection
  const handlePasscodeSelection = (length) => {
    setPasscodeLength(length);
    setStep(2); // Move to the passcode setup screen
  };

  // Step 2: Handle number button presses (to build passcode)
  const handleNumberPress = (num) => {
    if (passcode.length < passcodeLength) {
      setPasscode((prev) => prev + num);
    }
  };

  // Step 3: Handle confirm number button presses
  const handleConfirmNumberPress = (num) => {
    if (confirmPasscode.length < passcodeLength) {
      setConfirmPasscode((prev) => prev + num);
    }
  };

  // Handle backspace to delete digits
  const handleDelete = () => {
    if (passcode.length > 0) {
      setPasscode((prev) => prev.slice(0, -1));
    }
  };

  const handleConfirmDelete = () => {
    if (confirmPasscode.length > 0) {
      setConfirmPasscode((prev) => prev.slice(0, -1));
    }
  };

  // Step 4: Handle submission of passcode after confirmation
  const handlePasscodeSubmit = () => {
    if (passcode !== confirmPasscode) {
      setError("Passcodes don't match!");
      return;
    }
    if (passcode.length !== passcodeLength) {
      setError(`Passcode should be ${passcodeLength} digits long.`);
      return;
    }
    onPasscodeSetup(passcode); // Passcode setup is complete, move to chat screen
  };

  // Move to the confirmation step after passcode setup
  const moveToConfirmationStep = () => {
    if (passcode.length === passcodeLength) {
      setStep(3); // Move to confirmation step after setting the passcode
      setError("");
    } else {
      setError(`Passcode should be ${passcodeLength} digits long.`);
    }
  };

  // Render passcode input (either setup or confirm screen)
  const renderPasscodeInput = (isConfirm) => {
    const passcodeToDisplay = isConfirm ? confirmPasscode : passcode;
    return (
      <div style={styles.passcodeInput}>
        <div style={styles.passcodeDisplay}>
          {"●".repeat(passcodeToDisplay.length)}
        </div>
        <div style={styles.numberPad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, "←", 0, "✔"].map((btn) => (
            <button
              key={btn}
              onClick={() => {
                if (btn === "←") {
                  isConfirm ? handleConfirmDelete() : handleDelete();
                } else if (btn === "✔") {
                  isConfirm ? handlePasscodeSubmit() : moveToConfirmationStep(); // Move to confirmation after setup
                } else {
                  isConfirm
                    ? handleConfirmNumberPress(btn)
                    : handleNumberPress(btn);
                }
              }}
              style={styles.numberButton}
            >
              {btn}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {step === 1 ? (
        // Step 1: Passcode length selection screen
        <div style={styles.selectPasscode}>
          <h2>Choose Passcode Length</h2>
          <button
            onClick={() => handlePasscodeSelection(4)}
            style={styles.btnStyle}
          >
            4-Digit Passcode
          </button>
          <button
            onClick={() => handlePasscodeSelection(6)}
            style={styles.btnStyle}
          >
            6-Digit Passcode
          </button>
        </div>
      ) : step === 2 ? (
        // Step 2: Passcode setup screen
        <div style={styles.setupPasscode}>
          <h2>Set your {passcodeLength}-Digit Passcode</h2>
          <div style={styles.instructions}>Enter {passcodeLength} digits</div>
          {renderPasscodeInput(false)}
        </div>
      ) : (
        // Step 3: Passcode confirmation screen
        <div style={styles.setupPasscode}>
          <h2>Confirm your {passcodeLength}-Digit Passcode</h2>
          <div style={styles.instructions}>Confirm your passcode</div>
          {renderPasscodeInput(true)}
          {error && <div style={styles.error}>{error}</div>}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundColor: "#1a1a1a",
    color: "white",
    fontFamily: "sans-serif",
    flexDirection: "column",
    padding: "10px",
  },
  selectPasscode: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  setupPasscode: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "400px",
  },
  passcodeInput: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    marginBottom: "20px",
  },
  passcodeDisplay: {
    fontSize: "24px",
    marginBottom: "20px",
  },
  numberPad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gridGap: "10px",
    width: "100%",
    maxWidth: "300px",
  },
  numberButton: {
    fontSize: "24px",
    padding: "15px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    width: "60px",
    height: "60px",
  },
  btnStyle: {
    fontSize: "18px",
    padding: "10px",
    margin: "10px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
  instructions: {
    marginBottom: "10px",
    fontSize: "16px",
  },
  error: {
    color: "red",
    marginTop: "10px",
  },
};

export default AuthScreen;
