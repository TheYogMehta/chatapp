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
  Phone,
} from "lucide-react";

import { IconButton } from "../../../../components/ui/IconButton";
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
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let interval: any;
    if (callState?.status === "connected") {
      interval = setInterval(() => setDuration((d) => d + 1), 1000);
    } else {
      setDuration(0);
      setIsMinimized(false);
      setIsVideoEnabled(false);
    }
    return () => clearInterval(interval);
  }, [callState?.status]);

  useEffect(() => {
    if (callState?.remoteVideo && videoContainerRef.current) {
      videoContainerRef.current.innerHTML = "";
      videoContainerRef.current.appendChild(callState.remoteVideo);
      callState.remoteVideo.style.width = "100%";
      callState.remoteVideo.style.height = "100%";
      callState.remoteVideo.style.objectFit = "cover";
      callState.remoteVideo.style.borderRadius = "12px";
    }
  }, [callState?.remoteVideo, isMinimized]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
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

  const toggleVideo = () => {
    const newState = !isVideoEnabled;
    setIsVideoEnabled(newState);
    if (onSwitchStream) {
      onSwitchStream(newState ? "Video" : "Audio");
    }
  };

  const shareScreen = () => {
    if (onSwitchStream) {
      onSwitchStream("Screen");
      setIsVideoEnabled(true);
    }
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
                <IconButton
                  variant="success"
                  size="xl"
                  onClick={onAccept}
                >
                  <Phone size={32} />
                </IconButton>
                <IconButton
                  variant="danger"
                  size="xl"
                  onClick={onReject}
                >
                  <PhoneOff size={32} />
                </IconButton>
              </>
            ) : (
              <IconButton
                variant="danger"
                size="xl"
                onClick={onHangup}
              >
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
        <div style={{ flex: 1, position: "relative", backgroundColor: "black" }}>
          <div ref={videoContainerRef} style={{ width: "100%", height: "100%" }} />
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

  // Local Video Effect
  const localVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoEnabled]);

  // We need to import ChatClient to access the stream if it's not passed in callState.
  // Assuming callState might not have it.

  // I should add the import at the top of the file first.

  return (
    <OverlayContainer>
      <FullScreenContainer>
        <MinimizeButton onClick={() => setIsMinimized(true)}>
          <Minimize2 size={32} />
        </MinimizeButton>

        <MainVideoArea>
          <div
            ref={videoContainerRef}
            style={{
              width: "100%",
              height: "100%",
              display: callState.remoteVideo ? "block" : "none",
            }}
          />

          {/* Local Video PiP */}
          {isVideoEnabled && (
            <div style={{
              position: 'absolute',
              top: '80px',
              right: '20px',
              width: '120px',
              height: '160px',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.1)',
              zIndex: 10
            }}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
            </div>
          )}

          {!callState.remoteVideo && (
            <AvatarContainer style={{ width: 150, height: 150 }}>
              {callState.remoteSid?.[0]?.toUpperCase()}
            </AvatarContainer>
          )}
        </MainVideoArea>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <CallerName style={{ color: "white", marginBottom: 8 }}>
            Peer {callState.remoteSid?.slice(0, 6)}
          </CallerName>
          <CallStatus style={{ color: "#94a3b8" }}>
            {formatTime(duration)} • Connected
          </CallStatus>

          <ControlsRow>
            <IconButton
              variant={isMuted ? "primary" : "glass"}
              isActive={isMuted}
              size="xl"
              onClick={() => setIsMuted(!isMuted)}
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
              variant="glass"
              size="xl"
              onClick={shareScreen}
            >
              <Monitor size={28} />
            </IconButton>

            <IconButton
              variant="danger"
              size="xl"
              onClick={onHangup}
            >
              <PhoneOff size={28} />
            </IconButton>
          </ControlsRow>
        </div>
      </FullScreenContainer>
    </OverlayContainer>
  );
};
