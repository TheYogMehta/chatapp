import React, { useEffect } from 'react';
import { styles } from './Home/Home.styles';
import { colors } from '../theme/colors';

declare global {
  interface Window {
    google: any;
  }
}

interface LoginProps {
  onLogin: (token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  useEffect(() => {
    const initGoogle = () => {
      console.log("[Login] Attempting to init Google", { hasGoogle: !!window.google });
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: "588653192623-dldr83lei79ub9vqcbi45q7iofieqs1l.apps.googleusercontent.com",
          callback: (response: any) => {
             console.log("[Login] Google callback received", response);
            onLogin(response.credential);
          }
        });
        window.google.accounts.id.renderButton(
          document.getElementById("googleBtn"),
          { theme: "filled_black", size: "large", shape: "pill", width: 250 }
        );
      } else {
        console.log("[Login] window.google not found, retrying...");
        setTimeout(initGoogle, 100);
      }
    };
    initGoogle();
  }, [onLogin]);

  return (
    <div style={{ ...styles.appContainer, justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 className="title-large" style={{ marginBottom: '0.5rem' }}>GhostTalk</h1>
        <p style={{ color: colors.text.secondary, marginBottom: '2rem', letterSpacing: '0.5px' }}>Secure End-to-End Encrypted Chat</p>
      </div>
      
      <div className="glass-panel" style={{ 
          padding: '2.5rem', 
          borderRadius: '24px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          gap: '1.5rem', 
          width: '90%',
          maxWidth: '380px' 
      }}>
         <h3 style={{ margin: 0, fontWeight: 700, color: colors.text.primary }}>Authentication Required</h3>
         <p style={{ fontSize: '0.9rem', color: colors.text.muted, textAlign: 'center', lineHeight: '1.5' }}>
           To prevent identity spoofing, please sign in with Google. 
           We only use your email to verify your identity to your peers.
         </p>
         <div id="googleBtn" style={{ marginTop: '0.5rem', minHeight: '40px' }}></div>
      </div>
    </div>
  );
};
