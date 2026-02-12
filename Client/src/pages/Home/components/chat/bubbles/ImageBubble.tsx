import React from "react";
import { Download, Save, Loader2 } from "lucide-react";
import {
  MediaContainer,
  DownloadOverlay,
  MediaActionBtn,
} from "../Chat.styles";

interface ImageBubbleProps {
  src: string | null;
  thumbnailSrc: string | null;
  text: string | null;
  mediaStatus: string;
  isDownloaded: boolean;
  isDownloading: boolean;
  isRequestingDownload: boolean;
  progress: number;
  isLoading: boolean;
  onDownload: () => void;
  onSave: () => void;
  onMediaClick?: (
    url: string,
    type: "image" | "video",
    description?: string,
  ) => void;
}

export const ImageBubble: React.FC<ImageBubbleProps> = ({
  src,
  thumbnailSrc,
  text,
  mediaStatus,
  isDownloaded,
  isDownloading,
  isRequestingDownload,
  progress,
  isLoading,
  onDownload,
  onSave,
  onMediaClick,
}) => {
  if (src || (mediaStatus === "uploading" && thumbnailSrc)) {
    return (
      <MediaContainer>
        <img
          src={src || thumbnailSrc || ""}
          alt="attachment"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            if (onMediaClick) {
              onMediaClick(src || thumbnailSrc || "", "image", text || "");
            } else {
              window.open(src || thumbnailSrc || "", "_blank");
            }
          }}
          onError={(e) => {
            console.error(`[ImageBubble] Image load failed.`);
            e.currentTarget.style.display = "none";
          }}
          referrerPolicy="no-referrer"
          style={{
            cursor: "pointer",
            opacity: mediaStatus === "uploading" ? 0.7 : 1,
          }}
        />
        <MediaActionBtn
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
        >
          <Save size={16} />
        </MediaActionBtn>
        {mediaStatus === "uploading" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.3)",
              borderRadius: "12px",
            }}
          >
            <Loader2 className="animate-spin" size={24} color="white" />
            <span
              style={{
                color: "white",
                fontSize: "0.75rem",
                marginTop: "4px",
                fontWeight: 500,
              }}
            >
              Uploading...
            </span>
          </div>
        )}
      </MediaContainer>
    );
  }

  return (
    <MediaContainer onClick={!isDownloaded ? onDownload : undefined}>
      {thumbnailSrc && (
        <img
          src={thumbnailSrc}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(10px)",
            transform: "scale(1.1)",
            opacity: 0.6,
          }}
        />
      )}
      <DownloadOverlay>
        {isDownloading ? (
          <div style={{ fontWeight: "bold" }}>
            {isRequestingDownload ? "0%" : `${Math.round(progress * 100)}%`}
          </div>
        ) : isLoading ? (
          <Loader2 className="animate-spin" size={24} color="white" />
        ) : (
          <>
            <Download size={32} />
            <span style={{ fontSize: "12px", fontWeight: "500" }}>
              Download
            </span>
          </>
        )}
      </DownloadOverlay>
    </MediaContainer>
  );
};
