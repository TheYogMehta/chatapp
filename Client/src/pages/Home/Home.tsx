import React, { useState, useEffect } from "react";
import { useChatLogic } from "./hooks/useChatLogic";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ChatWindow } from "./components/chat/ChatWindow";
import { ConnectionSetup } from "./components/overlays/ConnectionSetup";
import { RequestModal } from "./components/overlays/RequestModal";
import { CallOverlay } from "./components/overlays/CallOverlay";
import { styles } from "./Home.styles";

const Home = () => {
  const { state, actions } = useChatLogic();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={styles.appContainer}>
      {state.error && <div style={styles.errorToast}>{state.error}</div>}
      {state.notification && (
        <div
          style={{
            ...styles.errorToast,
            backgroundColor:
              state.notification.type === "error" ? "#ef4444" : "#3b82f6",
          }}
        >
          {state.notification.message}
        </div>
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
        onLogoClick={() => actions.setView("chat")}
      />

      <main
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isMobile && (
          <div style={styles.mainHeader}>
            <button
              onClick={() => actions.setIsSidebarOpen(true)}
              style={styles.menuBtn}
            >
              ☰
            </button>
            <h2 style={styles.headerTitle}>GhostTalk</h2>
          </div>
        )}
        {state.view === "chat" && state.activeChat ? (
          <ChatWindow
            messages={state.messages}
            input={state.input}
            setInput={actions.setInput}
            onSend={actions.handleSend}
            activeChat={state.activeChat}
            onFileSelect={actions.handleFile}
          />
        ) : (
          <ConnectionSetup
            inviteCode={state.inviteCode}
            isGenerating={state.isGenerating}
            joinCode={state.joinCode}
            setJoinCode={actions.setJoinCode}
            onConnect={actions.handleJoin}
            setIsGenerating={actions.setIsGenerating}
            isJoining={state.isJoining}
          />
        )}
      </main>

      <CallOverlay
        callState={state.activeCall}
        onAccept={actions.acceptCall}
        onReject={actions.rejectCall}
        onHangup={actions.endCall}
      />

      {(state.inboundReq || state.isWaiting) && (
        <RequestModal
          inboundReq={state.inboundReq}
          isWaiting={state.isWaiting}
          setInboundReq={actions.setInboundReq}
          setIsWaiting={actions.setIsWaiting}
        />
      )}
    </div>
  );
};

export default Home;
