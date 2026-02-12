import { useState, useEffect } from "react";
import ChatClient from "../../../services/core/ChatClient";
import { executeDB, queryDB } from "../../../services/storage/sqliteService";
import { ChatMessage } from "../types";

interface UseCallLogicProps {
  activeChatRef: React.MutableRefObject<string | null>;
  loadSessions: () => void;
  addMessage: (msg: ChatMessage) => void;
}

export const useCallLogic = ({
  activeChatRef,
  loadSessions,
  addMessage,
}: UseCallLogicProps) => {
  const [activeCall, setActiveCall] = useState<any>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    const client = ChatClient;

    const onRemoteStream = (videoEl: HTMLVideoElement) => {
      setActiveCall((prev: any) =>
        prev ? { ...prev, remoteVideo: videoEl } : null,
      );
    };

    const onLocalStream = (stream: MediaStream | null) => {
      setLocalStream(stream);
    };

    const getSessionInfo = async (sid: string) => {
      try {
        const rows = await queryDB(
          "SELECT alias_name, alias_avatar, peer_name, peer_avatar, peer_email FROM sessions WHERE sid = ?",
          [sid],
        );
        if (rows.length > 0) {
          const r = rows[0];
          return {
            peerName: r.alias_name || r.peer_name || r.peer_email || "Unknown",
            peerAvatar: r.alias_avatar || r.peer_avatar,
          };
        }
      } catch (e) {
        console.error("Failed to load session info for call", e);
      }
      return { peerName: "Unknown", peerAvatar: null };
    };

    const onCallIncoming = async (call: any) => {
      const info = await getSessionInfo(call.sid);
      setActiveCall({ ...call, ...info, status: "ringing" });
    };

    const onCallOutgoing = async (call: any) => {
      const info = await getSessionInfo(call.sid);
      setActiveCall({ ...call, ...info, status: "outgoing" });
    };

    const onCallStarted = ({ sid }: { sid: string }) =>
      setActiveCall((prev: any) =>
        prev && prev.sid === sid ? { ...prev, status: "connected" } : prev,
      );

    const onIceStatus = (status: any) =>
      setActiveCall((prev: any) =>
        prev ? { ...prev, iceStatus: status } : null,
      );

    const onPeerMicStatus = ({ sid, muted }: { sid: string; muted: boolean }) =>
      setActiveCall((prev: any) =>
        prev && prev.sid === sid ? { ...prev, peerMicMuted: muted } : prev,
      );

    const onCallModeChanged = ({ sid, mode }: { sid: string; mode: any }) => {
      setActiveCall((prev: any) =>
        prev && prev.sid === sid ? { ...prev, type: mode } : prev,
      );
    };

    const onCallEnded = async (data: any) => {
      setActiveCall(null);
      const sid = typeof data === "string" ? data : data.sid;
      const duration = typeof data === "object" ? data.duration : 0;
      const connected = typeof data === "object" ? !!data.connected : false;

      let text = "";
      if (connected) {
        const min = Math.floor(duration / 60000);
        const sec = Math.floor((duration % 60000) / 1000);
        const durationStr = `${min}m ${sec}s`;
        text = `Call ended • ${durationStr}`;
      } else {
        text = "Missed Call";
      }

      const id = crypto.randomUUID();
      const timestamp = Date.now();

      try {
        await executeDB(
          "INSERT INTO messages (id, sid, sender, text, type, timestamp, status) VALUES (?, ?, 'system', ?, 'system', ?, 1)",
          [id, sid, text, timestamp],
        );

        if (activeChatRef.current === sid) {
          addMessage({
            id,
            sid,
            text,
            sender: "system",
            type: "system",
            timestamp,
            status: 1,
          });
        }
        loadSessions();
      } catch (e) {
        console.error("Failed to log call end:", e);
      }
    };

    client.on("call_incoming", onCallIncoming);
    client.on("call_outgoing", onCallOutgoing);
    client.on("call_started", onCallStarted);
    client.on("ice_status", onIceStatus);
    client.on("peer_mic_status", onPeerMicStatus);
    client.on("call_mode_changed", onCallModeChanged);
    client.on("call_ended", onCallEnded);

    client.on("local_stream_ready", onLocalStream);
    client.on("remote_stream_ready", onRemoteStream);

    return () => {
      client.off("call_incoming", onCallIncoming);
      client.off("call_outgoing", onCallOutgoing);
      client.off("call_started", onCallStarted);
      client.off("ice_status", onIceStatus);
      client.off("peer_mic_status", onPeerMicStatus);
      client.off("call_mode_changed", onCallModeChanged);
      client.off("call_ended", onCallEnded);
      client.off("local_stream_ready", onLocalStream);
      client.off("remote_stream_ready", onRemoteStream);
    };
  }, [addMessage, activeChatRef, loadSessions]);

  return {
    state: {
      activeCall,
      localStream,
    },
    actions: {
      startCall: (sid: string, type: any) => ChatClient.startCall(sid, type),
      switchStream: (mode: any) =>
        activeCall ? ChatClient.switchStream(activeCall.sid, mode) : undefined,
      acceptCall: () =>
        activeCall ? ChatClient.acceptCall(activeCall.sid) : undefined,
      rejectCall: () => {
        if (activeCall) ChatClient.endCall(activeCall.sid);
      },
      endCall: () => {
        if (activeCall) ChatClient.endCall(activeCall.sid);
        else ChatClient.endCall();
      },
    },
  };
};
