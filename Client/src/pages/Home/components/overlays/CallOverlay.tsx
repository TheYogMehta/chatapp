import React, { useState, useEffect, useRef } from "react";
import {
  User,
  PhoneOff,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Phone,
} from "lucide-react";

import { IconButton } from "../../../../components/ui/IconButton";
import { ChatClient } from "../../../../services/ChatClient";
import {
  OverlayContainer,
  CallCard,
  AvatarContainer,
  CallerInfo,
  CallerName,
  CallStatus,
  ControlsRow,
  MinimizedContainer,
  MaximizeButton,
  FullScreenContainer,
  MainVideoArea,
  MinimizeButton,
} from "./CallOverlay.styles";

interface CallOverlayProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callState: any;
  localStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onSwitchStream?: (mode: "Audio" | "Video" | "Screen") => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  callState,
  localStream,
  onAccept,
  onReject,
  onHangup,
  onSwitchStream,
}) => {
  const [duration, setDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenEnabled, setIsScreenEnabled] = useState(false);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const client = ChatClient.getInstance();
  useEffect(() => {
    const handleVideoToggle = (data: { enabled: boolean }) => {
      setIsVideoEnabled(data.enabled);
      if (data.enabled) setIsScreenEnabled(false);
    };
    const handleScreenToggle = (data: { enabled: boolean }) => {
      setIsScreenEnabled(data.enabled);
      if (data.enabled) setIsVideoEnabled(false);
    };

    client.on("video_toggled", handleVideoToggle);
    client.on("screen_toggled", handleScreenToggle);

    return () => {
      client.off("video_toggled", handleVideoToggle);
      client.off("screen_toggled", handleScreenToggle);
    };
  }, [client]);

  useEffect(() => {
    if (callState?.status !== "connected") {
      setDuration(0);
      return;
    }
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callState?.status]);

  useEffect(() => {
    if (!localPreviewRef.current || !localStream) return;
    localPreviewRef.current.srcObject = localStream;
    localPreviewRef.current.muted = true;
  }, [localStream]);

  useEffect(() => {
    const handleRemoteStream = (stream: MediaStream | null) => {
      if (remoteVideoRef.current) {
        if (stream) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch((err) => {
            console.error("Error playing remote video:", err);
          });
        } else {
          remoteVideoRef.current.srcObject = null;
        }
      }
    };

    client.on("remote_stream_ready", handleRemoteStream);

    const existingStream = client.getRemoteStream();
    if (existingStream) {
      handleRemoteStream(existingStream);
    }

    return () => {
      client.off("remote_stream_ready", handleRemoteStream);
    };
  }, [client]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    setPosition({
      x: clientX - dragStart.current.x,
      y: clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const toggleMic = () => {
    client.toggleMic();
    setIsMuted(!isMuted);
  };

  const toggleVideo = async () => {
    await client.toggleVideo();
  };

  const toggleScreen = async () => {
    await client.toggleScreenShare();
  };

  if (!callState || callState.status === "idle") return null;

  // Incoming / Outgoing Call Interface
  if (callState.status === "ringing" || callState.status === "outgoing") {
    const isIncoming = callState.status === "ringing";
    return (
      <OverlayContainer>
        <CallCard>
          <AvatarContainer isCalling>
            {callState.remoteSid?.[0]?.toUpperCase() || <User size={48} />}
          </AvatarContainer>
          <CallerInfo>
            <CallerName>
              {callState.remoteSid
                ? `Peer ${callState.remoteSid.slice(0, 6)}`
                : "Unknown"}
            </CallerName>
            <CallStatus>
              {isIncoming ? "Incoming Call..." : "Calling..."}
            </CallStatus>
          </CallerInfo>

          <ControlsRow>
            {isIncoming ? (
              <>
                <IconButton variant="success" size="xl" onClick={onAccept}>
                  <Phone size={32} />
                </IconButton>
                <IconButton variant="danger" size="xl" onClick={onReject}>
                  <PhoneOff size={32} />
                </IconButton>
              </>
            ) : (
              <IconButton variant="danger" size="xl" onClick={onHangup}>
                <PhoneOff size={32} />
              </IconButton>
            )}
          </ControlsRow>
        </CallCard>
      </OverlayContainer>
    );
  }

  // Minimized Active Call
  if (isMinimized) {
    return (
      <MinimizedContainer
        position={position}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{ flex: 1, position: "relative", backgroundColor: "black" }}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <MaximizeButton
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(false);
            }}
          >
            <Maximize2 size={16} />
          </MaximizeButton>
        </div>
      </MinimizedContainer>
    );
  }

  return (
    <OverlayContainer>
      <FullScreenContainer>
        <MinimizeButton onClick={() => setIsMinimized(true)}>
          <Minimize2 size={32} />
        </MinimizeButton>

        <MainVideoArea>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display:
                callState.remoteVideo &&
                (callState.type === "Video" || callState.type === "Screen")
                  ? "block"
                  : "none",
            }}
          />

          {/* Local Video PiP */}
          {isVideoEnabled && (
            <div
              style={{
                position: "absolute",
                top: "80px",
                right: "20px",
                width: "120px",
                height: "160px",
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                border: "2px solid rgba(255,255,255,0.1)",
                zIndex: 10,
              }}
            >
              <video
                ref={localPreviewRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                }}
              />
            </div>
          )}

          {(!callState.remoteVideo || callState.type === "Audio") && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                textAlign: "center",
                color: "white",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <AvatarContainer style={{ width: 150, height: 150 }}>
                {callState.peerAvatar ? (
                  <img
                    src={callState.peerAvatar}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  callState.peerName?.[0]?.toUpperCase() ||
                  callState.remoteSid?.[0]?.toUpperCase() || <User size={48} />
                )}
              </AvatarContainer>
              <CallerName style={{ fontSize: 24, marginBottom: 0 }}>
                {callState.peerName ||
                  `Peer ${callState.remoteSid?.slice(0, 6)}`}
              </CallerName>
              <CallStatus
                style={{
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {formatDuration(duration)} • Voice Call
                {callState.peerMicMuted && <MicOff size={16} color="red" />}
              </CallStatus>
            </div>
          )}
        </MainVideoArea>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <CallerName
            style={{
              color: "white",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
          >
            {callState.peerName || `Peer ${callState.remoteSid?.slice(0, 6)}`}
            {callState.peerMicMuted && <MicOff size={16} color="red" />}
          </CallerName>
          <CallStatus style={{ color: "#94a3b8" }}>
            {formatDuration(duration)} • Connected
          </CallStatus>

          <ControlsRow>
            <IconButton
              variant={isMuted ? "primary" : "glass"}
              isActive={isMuted}
              size="xl"
              onClick={toggleMic}
            >
              {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
            </IconButton>

            <IconButton
              variant={isVideoEnabled ? "primary" : "glass"}
              isActive={isVideoEnabled}
              size="xl"
              onClick={toggleVideo}
            >
              {isVideoEnabled ? <Video size={28} /> : <VideoOff size={28} />}
            </IconButton>

            <IconButton
              variant={isScreenEnabled ? "primary" : "glass"}
              isActive={isScreenEnabled}
              size="xl"
              onClick={toggleScreen}
            >
              {isScreenEnabled ? (
                <MonitorOff size={28} />
              ) : (
                <Monitor size={28} />
              )}
            </IconButton>

            <IconButton variant="danger" size="xl" onClick={onHangup}>
              <PhoneOff size={28} />
            </IconButton>
          </ControlsRow>
        </div>
      </FullScreenContainer>
    </OverlayContainer>
  );
};
