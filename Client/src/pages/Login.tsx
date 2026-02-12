import React, { useEffect } from "react";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Capacitor } from "@capacitor/core";
import {
  LoginContainer,
  HeaderSection,
  Title,
  Subtitle,
  LoginCard,
  LogoIcon,
  WelcomeTitle,
  WelcomeText,
  GoogleButton,
  LoadingSpinner,
  LoadingText,
} from "./Login.styles";

interface LoginProps {
  onLogin: (token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  useEffect(() => {
    const initSocialLogin = async () => {
      await SocialLogin.initialize({
        google: {
          webClientId:
            "588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com",
          mode: "online",
        },
      });
    };
    initSocialLogin().catch(console.error);
  }, []);

  const [isLoading, setIsLoading] = React.useState(false);

  const signIn = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (Capacitor.getPlatform() === "electron") {
        const result = await window.SafeStorage.googleLogin();
        if (result && result.idToken) {
          onLogin(result.idToken);
        } else {
          console.error("Electron Login Failed or Cancelled");
          setIsLoading(false);
        }
      } else {
        const response = await SocialLogin.login({
          provider: "google",
          options: {
            forceRefreshToken: true,
          },
        });

        if (
          response.result &&
          "idToken" in response.result &&
          response.result.idToken
        ) {
          onLogin(response.result.idToken);
        } else {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error("Sign-In Error:", error);
      setIsLoading(false);
    }
  };

  return (
    <LoginContainer>
      <HeaderSection>
        <Title>
          Chat<span>app</span>
        </Title>
        <Subtitle>Secure End-to-End Encrypted Chat</Subtitle>
      </HeaderSection>

      <LoginCard>
        <LogoIcon>C</LogoIcon>
        <WelcomeTitle>Welcome Back</WelcomeTitle>
        <WelcomeText>
          Sign in to verify your identity and start chatting securely with your
          peers.
        </WelcomeText>

        <GoogleButton
          onClick={signIn}
          disabled={isLoading}
          isLoading={isLoading}
        >
          {isLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Sign in with Google</span>
            </>
          )}
        </GoogleButton>
        {isLoading && (
          <LoadingText>Setting up secure environment...</LoadingText>
        )}
      </LoginCard>
    </LoginContainer>
  );
};
