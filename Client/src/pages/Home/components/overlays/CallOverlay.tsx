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
import { ChatClient } from "../../../../services/core/ChatClient";
import { StorageService } from "../../../../services/storage/StorageService";
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
  callState: any;
  localStream: MediaStream | null;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  callState,
  localStream,
  onAccept,
  onReject,
  onHangup,
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

  const [resolvedPeerAvatar, setResolvedPeerAvatar] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!callState?.peerAvatar) {
      setResolvedPeerAvatar(null);
      return;
    }
    const avatar = callState.peerAvatar;
    if (avatar.startsWith("data:") || avatar.startsWith("http")) {
      setResolvedPeerAvatar(avatar);
    } else {
      StorageService.getProfileImage(avatar.replace(/\.jpg$/, ""))
        .then((src) => {
          if (src) {
            setResolvedPeerAvatar(src);
          } else {
            return StorageService.getFileSrc(avatar, "image/jpeg");
          }
        })
        .then((src) => {
          if (src && typeof src === "string") setResolvedPeerAvatar(src);
        })
        .catch((e) => console.warn("Failed to resolve call avatar", e));
    }
  }, [callState?.peerAvatar]);

  const client = ChatClient.getInstance();
  const canScreenShare = client.canScreenShare;
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
          if (remoteVideoRef.current.srcObject !== stream) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch((err) => {
              console.error("Error playing remote video:", err);
            });
          }
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
    await client.toggleVideo(!isVideoEnabled);
  };

  const toggleScreen = async () => {
    await client.toggleScreenShare(!isScreenEnabled);
  };

  const displayName =
    callState?.peerName ||
    "Unknown";

  const activeMode =
    isScreenEnabled || callState?.type === "Screen"
      ? "Screen Share"
      : isVideoEnabled || callState?.type === "Video"
      ? "Video Call"
      : "Voice Call";

  const shouldShowRemoteVideo =
    callState?.type === "Video" ||
    callState?.type === "Screen" ||
    isVideoEnabled ||
    isScreenEnabled;

  if (!callState || callState.status === "idle") return null;

  if (callState.status === "ringing" || callState.status === "outgoing") {
    const isIncoming = callState.status === "ringing";
    return (
      <OverlayContainer>
        <CallCard>
          <AvatarContainer isCalling>
            {resolvedPeerAvatar ? (
              <img
                src={resolvedPeerAvatar}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "50%",
                }}
              />
            ) : (
              callState.remoteSid?.[0]?.toUpperCase() || <User size={48} />
            )}
          </AvatarContainer>
          <CallerInfo>
            <CallerName>{displayName}</CallerName>
            <CallStatus>
              {isIncoming ? "Incoming Call..." : "Ringing..."}
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
          style={{
            flex: 1,
            position: "relative",
            backgroundColor: "black",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
          }}
        >
          {shouldShowRemoteVideo ? (
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
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AvatarContainer
                style={{ width: 56, height: 56, marginBottom: 0 }}
              >
                {resolvedPeerAvatar ? (
                  <img
                    src={resolvedPeerAvatar}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  displayName?.[0]?.toUpperCase() || <User size={24} />
                )}
              </AvatarContainer>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{activeMode}</div>
            </div>
          )}
          <MaximizeButton
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(false);
            }}
          >
            <Maximize2 size={16} />
          </MaximizeButton>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 8,
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.92)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <IconButton
            variant={isMuted ? "primary" : "glass"}
            isActive={isMuted}
            size="sm"
            onClick={toggleMic}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </IconButton>

          {(isVideoEnabled || callState.type === "Video") && (
            <IconButton
              variant={isVideoEnabled ? "primary" : "glass"}
              isActive={isVideoEnabled}
              size="sm"
              onClick={toggleVideo}
            >
              {isVideoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
            </IconButton>
          )}

          {canScreenShare && (
            <IconButton
              variant={isScreenEnabled ? "primary" : "glass"}
              isActive={isScreenEnabled}
              size="sm"
              onClick={toggleScreen}
            >
              {isScreenEnabled ? <MonitorOff size={16} /> : <Monitor size={16} />}
            </IconButton>
          )}

          <IconButton variant="danger" size="sm" onClick={onHangup}>
            <PhoneOff size={16} />
          </IconButton>
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
              display: shouldShowRemoteVideo ? "block" : "none",
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

          {activeMode === "Voice Call" && (
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
                {resolvedPeerAvatar ? (
                  <img
                    src={resolvedPeerAvatar}
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
                {displayName}
              </CallerName>
              <CallStatus
                style={{
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {formatDuration(duration)} • {activeMode}
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
            {displayName}
            {callState.peerMicMuted && <MicOff size={16} color="red" />}
          </CallerName>
          <CallStatus style={{ color: "#94a3b8" }}>
            {formatDuration(duration)} • {activeMode}
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

            {canScreenShare && (
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
            )}

            <IconButton variant="danger" size="xl" onClick={onHangup}>
              <PhoneOff size={28} />
            </IconButton>
          </ControlsRow>
        </div>
      </FullScreenContainer>
    </OverlayContainer>
  );
};
