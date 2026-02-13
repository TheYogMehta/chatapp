import { IChatClient } from "../core/interfaces";
import { Capacitor } from "@capacitor/core";

export class CallService {
  private client: IChatClient;

  public peerConnection: RTCPeerConnection | null = null;
  public remoteStream: MediaStream | null = null;
  public remoteAudioEl: HTMLAudioElement | null = null;
  public isCalling: boolean = false;
  public isCallConnected: boolean = false;
  public callStartTime: number = 0;
  public currentLocalStream: MediaStream | null = null;
  public currentCallSid: string | null = null;
  public micStream: MediaStream | null = null;
  public cameraStream: MediaStream | null = null;
  public screenStream: MediaStream | null = null;

  public isMicEnabled: boolean = true;
  public isVideoEnabled: boolean = false;
  public isScreenEnabled: boolean = false;

  private turnCreds: any = null;
  private turnPromise: Promise<any> | null = null;
  private onTurnCreds: ((creds: any) => void) | null = null;

  public _pendingOffer: {
    sid: string;
    offer: RTCSessionDescriptionInit;
  } | null = null;
  public iceCandidateQueue: Array<{
    sid: string;
    candidate: RTCIceCandidateInit;
  }> = [];

  private ringtoneInterval: any = null;
  private audioContext: AudioContext | null = null;
  private hasEmittedCallConnected: boolean = false;

  constructor(client: IChatClient) {
    this.client = client;
  }

  private isAndroidPlatform(): boolean {
    return Capacitor.getPlatform() === "android";
  }

  private isElectronPlatform(): boolean {
    return !!(window as any).electron?.getDesktopSources;
  }

  public canUseScreenShare(): boolean {
    const nav = navigator.mediaDevices as any;
    return (
      this.isElectronPlatform() ||
      typeof nav?.getDisplayMedia === "function"
    );
  }

  private async getDisplayStream(): Promise<MediaStream> {
    const nav = navigator.mediaDevices as any;
    const getDisplayMedia =
      typeof nav?.getDisplayMedia === "function"
        ? nav.getDisplayMedia.bind(nav)
        : null;

    if (this.isElectronPlatform()) {
      try {
        const sources = await (window as any).electron.getDesktopSources();
        const source = Array.isArray(sources) ? sources[0] : null;
        if (!source?.id) throw new Error("No desktop source available");

        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080,
              maxFrameRate: 30,
            },
          },
        } as any);
      } catch (e) {
        console.warn(
          "[CallService] Electron desktop source capture failed, trying getDisplayMedia fallback",
          e,
        );
      }
    }

    if (getDisplayMedia) {
      try {
        return await getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 20, max: 30 },
          },
          audio: false,
        });
      } catch (e) {
        console.warn(
          "[CallService] getDisplayMedia with constraints failed, retrying with minimal constraints",
          e,
        );
        return await getDisplayMedia({ video: true, audio: false });
      }
    }

    throw new Error(
      this.isAndroidPlatform()
        ? "Screen sharing is not available in this Android runtime. Use a Chromium-based browser build or add native MediaProjection bridge support."
        : "Screen sharing is not supported on this device.",
    );
  }

  public playRingtone() {
    if (this.ringtoneInterval) return;
    try {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const ctx = this.audioContext;
      const playBeep = () => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.type = "sine";
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      };
      playBeep();
      this.ringtoneInterval = setInterval(playBeep, 2000);
    } catch (e) {
      console.warn("[CallService] AudioContext error:", e);
    }
  }

  public stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  public async startCall(
    sid: string,
    mode: "Audio" | "Video" | "Screen" = "Audio",
  ) {
    if (!this.client.sessions[sid]) throw new Error("Session not found");
    if (!this.client.sessions[sid].online) {
      this.client.emit("notification", {
        type: "error",
        message: "User is offline",
      });
      return;
    }
    if (this.isCalling) return;

    this.callStartTime = 0;

    try {
      this.isCalling = true;
      this.currentCallSid = sid;
      console.log("[CallService] startCall: Initiating WebRTC call to", sid);

      const callStartPayload = await this.client.encryptForSession(
        sid,
        JSON.stringify({ t: "MSG", data: { type: "CALL_START", mode } }),
        0,
      );
      this.client.send({
        t: "MSG",
        sid,
        data: { payload: callStartPayload },
        c: true,
        p: 0,
      });

      await this.createPeerConnection(sid);
      await this.initializeLocalMedia();

      if (mode === "Video") {
        await this.toggleVideo(true);
      } else if (mode === "Screen") {
        await this.toggleScreenShare(true);
      }

      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      const offerPayload = await this.client.encryptForSession(
        sid,
        JSON.stringify({
          t: "MSG",
          data: { type: "RTC_OFFER", offer },
        }),
        0,
      );
      this.client.send({
        t: "RTC_OFFER",
        sid,
        data: { payload: offerPayload },
      });

      console.log("[CallService] Sent WebRTC offer to", sid);
      this.client.emit("call_outgoing", { sid, type: mode, remoteSid: sid });

      setTimeout(() => {
        if (
          this.isCalling &&
          !this.isCallConnected &&
          this.currentCallSid === sid
        ) {
          console.warn("[CallService] Call timed out, cleaning up");
          this.client.emit("notification", {
            type: "error",
            message: "Call timed out",
          });
          this.endCall(sid);
        }
      }, 45000);
    } catch (err: any) {
      this.isCalling = false;
      this.currentCallSid = null;
      console.error("Error starting call:", err);
      this.client.emit("notification", {
        type: "error",
        message: "Could not start call: " + err.message,
      });
      this.client.emit("error", "Could not start call");
    }
  }

  public async switchStream(_sid: string, mode: "Audio" | "Video" | "Screen") {
    if (!this.isCalling) return;
    console.log(`[CallService] Switching stream to ${mode}`);

    try {
      if (mode === "Video") {
        await this.toggleVideo(true);
      } else if (mode === "Screen") {
        await this.toggleScreenShare(true);
      } else {
        await this.toggleVideo(false);
        await this.toggleScreenShare(false);
      }
    } catch (err: any) {
      console.error("Failed to switch stream:", err);
      this.client.emit("notification", {
        type: "error",
        message: err.message || "Failed to switch stream",
      });
    }
  }

  public waitForTurnCredentials(): Promise<any> {
    if (this.turnCreds) return Promise.resolve(this.turnCreds);
    if (this.turnPromise) return this.turnPromise;

    this.turnPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.turnPromise = null;
        this.onTurnCreds = null;
        console.error("[CallService] TURN credential request timed out");
        reject(new Error("TURN timeout"));
      }, 5000);

      this.onTurnCreds = (data: any) => {
        clearTimeout(timeout);
        this.turnCreds = data;
        this.turnPromise = null;
        this.onTurnCreds = null;
        resolve(data);
      };

      this.client.send({ t: "GET_TURN_CREDS", c: true, p: 0 });
    });

    return this.turnPromise;
  }

  public resolveTurnCreds(data: any) {
    if (this.onTurnCreds) {
      this.onTurnCreds(data);
    }
  }

  private async getTurnCredentialsWithFallback(timeoutMs = 1500): Promise<any> {
    try {
      return await Promise.race([
        this.waitForTurnCredentials(),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
    } catch (e) {
      console.warn("[CallService] Proceeding without TURN credentials", e);
      return null;
    }
  }

  private emitCallConnected(sid: string) {
    if (this.hasEmittedCallConnected) return;
    this.hasEmittedCallConnected = true;
    this.isCallConnected = true;
    this.callStartTime = Date.now();
    this.client.emit("call_started", {
      sid,
      status: "connected",
      remoteSid: sid,
    });
  }

  private async createPeerConnection(sid: string): Promise<void> {
    if (this.peerConnection) {
      console.warn(
        "[CallService] PeerConnection already exists — skipping create",
      );
      return;
    }

    console.log("[CallService] Creating RTCPeerConnection");

    const creds = await this.getTurnCredentialsWithFallback();

    const iceServers: RTCIceServer[] = [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ];

    if (creds && creds.urls) {
      iceServers.push({
        urls: creds.urls,
        username: creds.username,
        credential: creds.credential,
      });
    }

    this.peerConnection = new RTCPeerConnection({
      iceServers: iceServers,
      iceTransportPolicy: "all",
      iceCandidatePoolSize: 10,
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: "RTC_ICE",
          sid,
          candidate: event.candidate,
        });
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE:", this.peerConnection?.iceConnectionState);
      if (this.peerConnection?.iceConnectionState === "connected") {
        this.emitCallConnected(sid);
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log("[CallService] Received remote track", event.track.kind);

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.attachRemoteAudio(this.remoteStream);
      }

      this.remoteStream.addTrack(event.track);
      this.client.emit("remote_stream_ready", this.remoteStream);
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log(
        "[CallService] PC connection state:",
        this.peerConnection?.connectionState,
      );
      if (this.peerConnection?.connectionState === "connected") {
        this.emitCallConnected(sid);
      }
    };
  }

  private async sendSignal(signal: {
    type: string;
    sid: string;
    [key: string]: any;
  }) {
    const { type, sid, ...rest } = signal;
    const innerType = type === "RTC_ICE" ? "ICE_CANDIDATE" : type;

    const payload = await this.client.encryptForSession(
      sid,
      JSON.stringify({
        t: "MSG",
        data: { type: innerType, ...rest },
      }),
      0,
    );
    this.client.send({ t: type, sid, data: { payload } });
  }

  private attachRemoteAudio(stream: MediaStream) {
    if (!this.remoteAudioEl) {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      (audio as any).playsInline = true;
      audio.controls = false;
      audio.muted = false;
      audio.volume = 1.0;

      document.body.appendChild(audio);
      this.remoteAudioEl = audio;
    }

    this.remoteAudioEl.srcObject = stream;

    const playPromise = this.remoteAudioEl.play();
    if (playPromise) {
      playPromise.catch((err) => {
        console.warn("[CallService] Audio play() blocked:", err);
      });
    }
  }

  private async initializeLocalMedia(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
        },
      });

      if (this.peerConnection) {
        this.micStream.getTracks().forEach((track) => {
          this.peerConnection!.addTrack(track, this.micStream!);
        });
      }

      this.currentLocalStream = this.micStream;
      this.client.emit("local_stream_ready", this.currentLocalStream);
      console.log("[CallService] Local media initialized");
    } catch (e) {
      console.error("Error initializing local media", e);
      this.client.emit("notification", {
        type: "error",
        message: "Microphone error: " + e,
      });
      throw e;
    }
  }

  public resumeAudioPlayback() {
    if (this.remoteAudioEl) {
      this.remoteAudioEl.muted = false;
      this.remoteAudioEl.volume = 1.0;
      this.remoteAudioEl.play().catch(() => {});
    }

    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
  }

  private async negotiate(sid: string) {
    if (!this.peerConnection || !this.isCallConnected) return;
    try {
      console.log("[CallService] Renegotiating connection...");
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      const offerPayload = await this.client.encryptForSession(
        sid,
        JSON.stringify({
          t: "MSG",
          data: { type: "RTC_OFFER", offer },
        }),
        0,
      );
      this.client.send({
        t: "RTC_OFFER",
        sid,
        data: { payload: offerPayload },
      });
    } catch (e) {
      console.error("[CallService] Renegotiation failed:", e);
    }
  }

  public async toggleVideo(enable?: boolean): Promise<void> {
    const shouldEnable = enable !== undefined ? enable : !this.isVideoEnabled;
    const sid = this.currentCallSid;
    if (!sid || !this.isCalling || !this.peerConnection) return;

    try {
      if (shouldEnable) {
        if (this.isScreenEnabled) {
          if (this.screenStream) {
            this.screenStream.getTracks().forEach((t) => t.stop());
            this.screenStream = null;
          }
          this.isScreenEnabled = false;
          this.client.emit("screen_toggled", { enabled: false });
        }

        this.cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 },
          },
          audio: false,
        });

        const videoTrack = this.cameraStream.getVideoTracks()[0];
        if (videoTrack) {
          const transceivers = this.peerConnection.getTransceivers();
          const videoTransceiver = transceivers.find(
            (t) => t.receiver.track.kind === "video",
          );

          if (videoTransceiver && videoTransceiver.sender) {
            await videoTransceiver.sender.replaceTrack(videoTrack);
            videoTransceiver.direction = "sendrecv";
          } else {
            this.peerConnection.addTrack(videoTrack, this.cameraStream);
          }
        }
        this.currentLocalStream = new MediaStream([
          ...this.micStream!.getTracks(),
          videoTrack,
        ]);

        this.isVideoEnabled = true;
        console.log("[CallService] Video enabled");
      } else {
        const transceivers = this.peerConnection.getTransceivers();
        const videoTransceiver = transceivers.find(
          (t) => t.receiver.track.kind === "video",
        );

        if (videoTransceiver && videoTransceiver.sender) {
          await videoTransceiver.sender.replaceTrack(null);
          videoTransceiver.direction = "recvonly";
        }
        if (this.cameraStream) {
          this.cameraStream.getTracks().forEach((t) => t.stop());
          this.cameraStream = null;
        }

        this.currentLocalStream = this.micStream;
        this.isVideoEnabled = false;
        console.log("[CallService] Video disabled");
      }

      this.client.emit("local_stream_ready", this.currentLocalStream);
      this.client.emit("video_toggled", { enabled: this.isVideoEnabled });

      await this.negotiate(sid);
      const mode = this.isVideoEnabled ? "Video" : "Audio";
      console.log(`[CallService] Sending CALL_MODE: ${mode}`);
      const modePayload = await this.client.encryptForSession(
        sid,
        JSON.stringify({ t: "MSG", data: { type: "CALL_MODE", mode } }),
        0,
      );
      this.client.send({
        t: "MSG",
        sid,
        data: { payload: modePayload },
        c: true,
        p: 0,
      });
    } catch (e: any) {
      console.error("Error toggling video:", e);
      this.client.emit("notification", {
        type: "error",
        message: "Camera error: " + e.message,
      });
    }
  }

  public async toggleScreenShare(enable?: boolean): Promise<void> {
    const shouldEnable = enable !== undefined ? enable : !this.isScreenEnabled;
    const sid = this.currentCallSid;
    if (!sid || !this.isCalling || !this.peerConnection) return;

    try {
      if (shouldEnable) {
        if (this.isVideoEnabled) {
          if (this.cameraStream) {
            this.cameraStream.getTracks().forEach((t) => t.stop());
            this.cameraStream = null;
          }
          this.isVideoEnabled = false;
          this.client.emit("video_toggled", { enabled: false });
        }

        this.screenStream = await this.getDisplayStream();

        const screenTrack = this.screenStream.getVideoTracks()[0];
        if (!screenTrack) {
          throw new Error("No video track found in screen capture stream");
        }
        if (screenTrack) {
          const transceivers = this.peerConnection.getTransceivers();
          const videoTransceiver = transceivers.find(
            (t) => t.receiver.track.kind === "video",
          );

          if (videoTransceiver && videoTransceiver.sender) {
            await videoTransceiver.sender.replaceTrack(screenTrack);
            videoTransceiver.direction = "sendrecv";
          } else {
            this.peerConnection.addTrack(screenTrack, this.screenStream);
          }

          screenTrack.onended = () => {
            console.log("[CallService] Screen share ended by user");
            this.toggleScreenShare(false);
          };
        }
        this.currentLocalStream = new MediaStream([
          ...this.micStream!.getTracks(),
          screenTrack,
        ]);

        this.isScreenEnabled = true;
        console.log("[CallService] Screen share enabled");
      } else {
        const transceivers = this.peerConnection.getTransceivers();
        const videoTransceiver = transceivers.find(
          (t) => t.receiver.track.kind === "video",
        );

        if (videoTransceiver && videoTransceiver.sender) {
          await videoTransceiver.sender.replaceTrack(null);
          videoTransceiver.direction = "recvonly";
        }

        if (this.screenStream) {
          this.screenStream.getTracks().forEach((t) => t.stop());
          this.screenStream = null;
        }

        this.currentLocalStream = this.micStream;
        this.isScreenEnabled = false;
        console.log("[CallService] Screen share disabled");
      }

      this.client.emit("local_stream_ready", this.currentLocalStream);
      this.client.emit("screen_toggled", { enabled: this.isScreenEnabled });

      await this.negotiate(sid);
      const mode = this.isScreenEnabled ? "Screen" : "Audio";
      console.log(`[CallService] Sending CALL_MODE: ${mode}`);
      const modePayload = await this.client.encryptForSession(
        sid,
        JSON.stringify({ t: "MSG", data: { type: "CALL_MODE", mode } }),
        0,
      );
      this.client.send({
        t: "MSG",
        sid,
        data: { payload: modePayload },
        c: true,
        p: 0,
      });
    } catch (e: any) {
      console.error("Error toggling screen share:", e);
      this.client.emit("notification", {
        type: "error",
        message: "Screen share error: " + e.message,
      });
    }
  }

  public async acceptCall(sid: string) {
    this.isCalling = true;
    this.currentCallSid = sid;
    this.stopRingtone();

    if (this._pendingOffer && this._pendingOffer.sid === sid) {
      console.log("[CallService] Processing the stashed offer now.");
      const offerToProcess = this._pendingOffer.offer;
      this._pendingOffer = null;
      await this.handleRTCOffer(sid, offerToProcess);
    }

    const payload = await this.client.encryptForSession(
      sid,
      JSON.stringify({ t: "MSG", data: { type: "CALL_ACCEPT" } }),
      0,
    );
    this.client.send({ t: "MSG", sid, data: { payload }, c: true, p: 0 });
  }

  public async endCall(sid?: string) {
    const targetSid = sid || this.currentCallSid;
    if (!targetSid) return;

    const payload = await this.client.encryptForSession(
      targetSid,
      JSON.stringify({ t: "MSG", data: { type: "CALL_END" } }),
      0,
    );

    this.client.send({
      t: "MSG",
      sid: targetSid,
      data: { payload },
      c: true,
      p: 0,
    });
    const wasConnected = this.isCallConnected;
    this.cleanupCall();
    const duration = this.callStartTime ? Date.now() - this.callStartTime : 0;
    this.client.emit("call_ended", {
      sid: targetSid,
      duration,
      connected: wasConnected,
    });
  }

  public cleanupCall() {
    this.stopRingtone();
    this.isCalling = false;
    this.currentCallSid = null;
    this.isCallConnected = false;
    this.hasEmittedCallConnected = false;

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
      this.cameraStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }

    this.currentLocalStream = null;
    this.remoteStream = null;

    this.isMicEnabled = true;
    this.isVideoEnabled = false;
    this.isScreenEnabled = false;

    this.client.emit("local_stream_ready", null);
    this.client.emit("remote_stream_ready", null);
  }

  public async toggleMic() {
    if (this.micStream) {
      let isMuted = false;
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
        isMuted = !track.enabled;
      });

      this.isMicEnabled = !isMuted;

      if (this.currentCallSid) {
        const micPayload = await this.client.encryptForSession(
          this.currentCallSid,
          JSON.stringify({
            t: "MSG",
            data: { type: "MIC_STATUS", muted: isMuted },
          }),
          0,
        );
        this.client.send({
          t: "MSG",
          sid: this.currentCallSid,
          data: { payload: micPayload },
          c: true,
          p: 0,
        });
      }
      return isMuted;
    }
    return true;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public async handleRTCOffer(sid: string, offer: RTCSessionDescriptionInit) {
    console.log("[CallService] handleRTCOffer");

    if (!this.isCalling) {
      console.log("[CallService] Stashing offer until user answers.");
      this._pendingOffer = { sid, offer };
      return;
    }

    if (!this.peerConnection) {
      await this.createPeerConnection(sid);
      await this.initializeLocalMedia();
    }

    await this.peerConnection!.setRemoteDescription(offer);
    await this.flushPendingIce();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.sendSignal({
      type: "RTC_ANSWER",
      sid,
      answer,
    });

    if (
      this.peerConnection?.connectionState === "connected" ||
      this.peerConnection?.iceConnectionState === "connected"
    ) {
      this.emitCallConnected(sid);
    }
  }

  public async handleRTCAnswer(sid: string, answer: RTCSessionDescriptionInit) {
    try {
      console.log("[CallService] Received RTC answer from", sid);

      if (!this.peerConnection) {
        console.warn("[CallService] No peer connection for RTC answer");
        return;
      }

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer),
      );
      await this.flushPendingIce();
      console.log("[CallService] Set remote description from answer");

      if (
        this.peerConnection?.connectionState === "connected" ||
        this.peerConnection?.iceConnectionState === "connected"
      ) {
        this.emitCallConnected(sid);
      }
    } catch (err) {
      console.error("[CallService] Error handling RTC answer:", err);
    }
  }

  public async handleICECandidate(sid: string, candidate: RTCIceCandidateInit) {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.iceCandidateQueue.push({ sid, candidate });
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("[CallService] Error adding ICE candidate:", err);
    }
  }

  private async flushPendingIce() {
    while (this.iceCandidateQueue.length > 0) {
      const item = this.iceCandidateQueue.shift();
      if (item) {
        try {
          await this.peerConnection?.addIceCandidate(
            new RTCIceCandidate(item.candidate),
          );
        } catch (e) {
          console.error("[CallService] Failed to flush ICE:", e);
        }
      }
    }
  }
}
