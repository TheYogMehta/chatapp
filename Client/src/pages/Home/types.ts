export interface Reaction {
  id: string;
  messageId: string;
  senderEmail: string;
  emoji: string;
  timestamp: number;
}

export interface ChatMessage {
  sid: string;
  sender: "me" | "other" | "system";
  status?: 1 | 2 | 3;
  timestamp: number;

  type:
  | "text"
  | "image"
  | "audio"
  | "file"
  | "video"
  | "sticker"
  | "live share port"
  | "system"
  | "deleted";

  text?: string;

  media?: {
    url: string;
    mime: string;
    size: number;
    name?: string;
    duration?: number;
  };

  shared?: {
    port: number;
  };

  id?: string;
  thumbnail?: string;
  tempUrl?: string;
  mediaStatus?:
  | "pending"
  | "downloading"
  | "downloaded"
  | "error"
  | "uploading";
  mediaFilename?: string;
  mediaTotalSize?: number;
  mediaCurrentSize?: number;
  mediaProgress?: number;
  mediaMime?: string;
  replyTo?: {
    id: string;
    text?: string;
    sender: string;
    type: string;
    mediaFilename?: string;
    thumbnail?: string;
  };
  reactions?: Reaction[];
}

export interface InboundReq {
  sid: string;
  publicKey: string;
  email?: string;
  emailHash?: string;
  name?: string;
  avatar?: string;
  nameVersion?: number;
  avatarVersion?: number;
}

export type CallStatus = "idle" | "calling" | "ringing" | "connected";

export interface CallState {
  status: CallStatus;
  type: "audio" | "video" | null;
  remoteSid: string | null;
  isIncoming: boolean;
  iceStatus?: string;
}

export interface SessionData {
  sid: string;
  lastMsg: string;
  lastMsgType: string;
  lastTs: number;
  unread: number;
  online: boolean;
  alias_name?: string;
  alias_avatar?: string;
  peer_name?: string;
  peer_avatar?: string;
  peerEmail?: string;
}
