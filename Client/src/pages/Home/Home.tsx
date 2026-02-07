import React, { useState, useEffect } from "react";
import { useChatLogic } from "./hooks/useChatLogic";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ChatWindow } from "./components/chat/ChatWindow";
import { ConnectionSetup } from "./components/overlays/ConnectionSetup";
import { RequestModal } from "./components/overlays/RequestModal";
import { CallOverlay } from "./components/overlays/CallOverlay";
import { WelcomeView } from "./components/views/WelcomeView";
import { NotificationToast } from "./components/overlays/NotificationToast";
import { SettingsOverlay } from "./components/overlays/SettingsOverlay";
import { ProfileSetup } from "./components/overlays/ProfileSetup";
import { AppLockScreen } from "./components/overlays/AppLockScreen";
import LoadingScreen from "../LoadingScreen";
import { AccountService } from "../../services/AccountService";
import ChatClient from "../../services/ChatClient";
import { Login } from "../Login";
import { RenameModal } from "./components/overlays/RenameModal";
import { useHistory } from "react-router-dom";
import { SecureChatWindow } from "../../pages/SecureChat/SecureChatWindow";
import {
  AppContainer,
  MainContent,
  MobileHeader,
  HeaderTitle,
  MenuButton,
  ErrorToast
} from "./Home.styles";
import { Menu, Lock } from "lucide-react";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: "red" }}>
          <h2>Something went wrong.</h2>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const Home = () => {
  const history = useHistory();
  const { state, actions } = useChatLogic();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(true);
  const [isLocked, setIsLocked] = useState(true);
  const [storedAccounts, setStoredAccounts] = useState<any[]>([]);
  const [renameTarget, setRenameTarget] = useState<{
    sid: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    checkInitialState();
  }, []);

  const checkInitialState = async () => {
    try {
      const accs = await AccountService.getAccounts();
      console.log("[Home] Loaded accounts from storage:", accs);
      setStoredAccounts(accs);

      if (accs.length === 0) {
        console.log("[Home] No accounts found, setting isLocked=false");
        setIsLocked(false);
      } else {
        console.log("[Home] Accounts found, setting isLocked=true");
        setIsLocked(true);
      }
    } catch (e) {
      console.error("[Home] Failed to load initial state:", e);
      setIsLocked(false);
    }
  };

  const handleUnlock = async (email: string) => {
    try {
      await ChatClient.switchAccount(email);
      setIsLocked(false);
    } catch (e) {
      console.error("Unlock failed", e);
    }
  };

  useEffect(() => {
    console.log("[Home] Render state:", {
      userEmail: state.userEmail,
      view: state.view,
    });
  }, [state.userEmail, state.view]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // Right Swipe
    if (isRightSwipe && isMobile && !state.isSidebarOpen) {
      if (touchStart < 50) {
        actions.setIsSidebarOpen(true);
      }
    }
    // Left Swipe
    if (isLeftSwipe && isMobile && state.isSidebarOpen) {
      actions.setIsSidebarOpen(false);
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (state.isLoading) {
    return <LoadingScreen message="Checking authentication..." />;
  }

  if (isLocked) {
    return (
      <AppLockScreen
        mode="lock_screen"
        accounts={storedAccounts}
        onUnlockAccount={handleUnlock}
        onAddAccount={() => setIsLocked(false)}
        onSuccess={() => { }}
      />
    );
  }

  if (!state.userEmail) {
    console.log("[Home] Rendering Login");
    return <Login onLogin={actions.login} />;
  }

  console.log("[Home] Rendering Main UI");

  return (
    <ErrorBoundary>
      <AppContainer
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {state.error && <ErrorToast>{state.error}</ErrorToast>}
        {state.notification && (
          <NotificationToast
            type={state.notification.type as "error" | "info" | "success"}
            message={state.notification.message}
            onClose={actions.clearNotification}
          />
        )}

        <Sidebar
          sessions={state.sessions}
          activeChat={state.activeChat}
          isOpen={state.isSidebarOpen}
          isMobile={isMobile}
          onSelect={(sid: string) => {
            actions.setActiveChat(sid);
            actions.setView("chat");
            actions.setIsSidebarOpen(false);
          }}
          onAddPeer={() => {
            actions.setView("add");
            actions.setActiveChat(null);
            actions.setIsSidebarOpen(false);
          }}
          onClose={() => actions.setIsSidebarOpen(false)}
          onLogoClick={() => {
            actions.setView("welcome");
            actions.setActiveChat(null);
          }}
          onSettings={() => {
            setShowSettings(true);
            actions.setIsSidebarOpen(false);
          }}
          onRename={(sid, currentName) =>
            setRenameTarget({ sid, name: currentName })
          }
          onOpenVault={() => {
            actions.setActiveChat("secure-vault");
            actions.setView("chat");
            actions.setIsSidebarOpen(false);
          }}
        />

        <MainContent>
          {isMobile && state.view !== "chat" && (
            <MobileHeader>
              <MenuButton onClick={() => actions.setIsSidebarOpen(true)}>
                <Menu size={24} />
              </MenuButton>
              <div style={{ flex: 1 }}>
                <HeaderTitle onClick={() => actions.setView("welcome")}>
                  Chatapp
                </HeaderTitle>
              </div>
              <MenuButton onClick={() => history.push("/secure-chat")}>
                <Lock size={20} />
              </MenuButton>
            </MobileHeader>
          )}
          {state.view === "chat" && state.activeChat === "secure-vault" ? (
            <SecureChatWindow />
          ) : state.view === "chat" && state.activeChat ? (
            <ChatWindow
              messages={state.messages}
              input={state.input}
              setInput={actions.setInput}
              onSend={actions.handleSend}
              activeChat={state.activeChat}
              session={state.sessions.find((s) => s.sid === state.activeChat)}
              onFileSelect={actions.handleFile}
              peerOnline={state.peerOnline}
              onStartCall={(mode: any) => actions.startCall(mode)}
              onBack={
                isMobile ? () => actions.setIsSidebarOpen(true) : undefined
              }
              replyingTo={state.replyingTo}
              setReplyingTo={actions.setReplyingTo}
            />
          ) : state.view === "add" ? (
            <ConnectionSetup
              targetEmail={state.targetEmail}
              setTargetEmail={actions.setTargetEmail}
              onConnect={actions.handleConnect}
              isJoining={state.isJoining}
            />
          ) : (
            <WelcomeView onAddFriend={() => actions.setView("add")} />
          )}
        </MainContent>

        <CallOverlay
          callState={state.activeCall}
          localStream={state.localStream}
          onAccept={actions.acceptCall}
          onReject={actions.rejectCall}
          onHangup={actions.endCall}
          onSwitchStream={actions.switchStream}
        />

        {(state.inboundReq || state.isWaiting) && (
          <RequestModal
            inboundReq={state.inboundReq}
            isWaiting={state.isWaiting}
            setInboundReq={actions.setInboundReq}
            setIsWaiting={actions.setIsWaiting}
          />
        )}

        {showSettings && (
          <SettingsOverlay
            onClose={() => setShowSettings(false)}
            currentUserEmail={state.userEmail}
          />
        )}

        {renameTarget && (
          <RenameModal
            currentName={renameTarget.name}
            onRename={(newName) => {
              actions.handleSetAlias(renameTarget.sid, newName);
              setRenameTarget(null);
            }}
            onCancel={() => setRenameTarget(null)}
          />
        )}

        {showProfileSetup && state.userEmail && (
          <ProfileSetup
            userEmail={state.userEmail}
            onComplete={() => setShowProfileSetup(false)}
          />
        )}

        {isLocked && <AppLockScreen onSuccess={() => setIsLocked(false)} />}
      </AppContainer>
    </ErrorBoundary>
  );
};

export default Home;
