import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { ChatClient } from "../services/ChatClient";
import { isTrustedUrl } from "../utils/trustedDomains";

const PreviewContainer = styled.a`
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
  margin-top: 8px;
  text-decoration: none;
  color: inherit;
  transition: background 0.2s;
  max-width: 400px;

  &:hover {
    background: rgba(0, 0, 0, 0.3);
  }
`;

const PreviewImage = styled.img`
  width: 100%;
  height: 200px;
  object-fit: cover;
`;

const PreviewContent = styled.div`
  padding: 12px;
`;

const PreviewTitle = styled.div`
  font-weight: bold;
  font-size: 0.95rem;
  margin-bottom: 4px;
  color: #e5e7eb;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const PreviewDesc = styled.div`
  font-size: 0.85rem;
  color: #9ca3af;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Domain = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
`;

interface LinkPreviewProps {
  url: string;
  onMediaClick?: (src: string, type: "image" | "video") => void;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({
  url,
  onMediaClick,
}) => {
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchMetadata = async () => {
      try {
        setLoading(true);
        setError(false);

        if (isTrustedUrl(url)) {
          if (/\.(gif|jpe?g|png|webp|bmp|tiff)$/i.test(new URL(url).pathname)) {
            if (mounted) {
              setImageSrc(url);
              setMetadata({
                title: url.split("/").pop(),
                description: "",
                image: url,
                url: url,
                type: "image",
              });
              setLoading(false);
            }
            return;
          }

          try {
            const res = await fetch(url, { mode: "cors" });
            const contentType = res.headers.get("content-type") || "";

            if (contentType.startsWith("image/")) {
              if (mounted) {
                setImageSrc(url);
                setMetadata({
                  type: "image",
                  url,
                  title: url.split("/").pop(),
                  image: url,
                });
              }
            } else {
              const text = await res.text();
              const parser = new DOMParser();
              const doc = parser.parseFromString(text, "text/html");

              const getMeta = (name: string) =>
                doc
                  .querySelector(`meta[property="${name}"]`)
                  ?.getAttribute("content") ||
                doc
                  .querySelector(`meta[name="${name}"]`)
                  ?.getAttribute("content");

              const title = getMeta("og:title") || doc.title || "";
              const description =
                getMeta("og:description") || getMeta("description") || "";
              const image = getMeta("og:image");

              if (mounted) {
                setMetadata({ title, description, image, url, type: "link" });
                if (image) setImageSrc(image);
              }
            }
            if (mounted) setLoading(false);
            return;
          } catch (e) {
            console.warn(
              "Client fetch failed (likely CORS), using basic display",
              e,
            );
            if (mounted) {
              setMetadata({
                title: new URL(url).hostname,
                description: "",
                url,
                type: "link",
              });
              setLoading(false);
            }
            return;
          }
        }

        const data = await ChatClient.getInstance().fetchMetadata(url);

        if (mounted) {
          setMetadata(data);

          if (data.image) {
            if (isTrustedUrl(data.image) || data.image.startsWith("data:")) {
              setImageSrc(data.image);
            } else {
              try {
                const img = await ChatClient.getInstance().fetchImage(
                  data.image,
                );
                if (mounted) setImageSrc(img);
              } catch (e) {
                console.error("Failed to fetch image", e);
              }
            }
          } else {
            if (data.type === "image") {
              if (isTrustedUrl(url)) {
                setImageSrc(url);
              } else {
                try {
                  const img = await ChatClient.getInstance().fetchImage(url);
                  if (mounted) setImageSrc(img);
                } catch (e) {
                  console.error("Failed to fetch image", e);
                }
              }
            }
          }

          if (
            !data.title &&
            !data.description &&
            !data.image &&
            data.type !== "image"
          ) {
            setError(true);
          }
        }
      } catch (err) {
        console.error("Failed to fetch link preview:", err);
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchMetadata();

    return () => {
      mounted = false;
    };
  }, [url]);

  if (loading)
    return (
      <PreviewContainer>
        <div
          style={{
            padding: "10px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: 0.7,
          }}
        >
          <Loader2 className="animate-spin" size={16} />
          <span style={{ fontSize: "0.8rem" }}>Loading preview...</span>
        </div>
      </PreviewContainer>
    );

  if (error || (!metadata && !imageSrc)) return null;

  const handleContentClick = (e: React.MouseEvent) => {
    if (imageSrc && (metadata?.type === "image" || onMediaClick)) {
      e.preventDefault();
      e.stopPropagation();
      onMediaClick?.(imageSrc, "image");
    }
  };

  return (
    <PreviewContainer
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleContentClick}
      style={{ cursor: imageSrc && onMediaClick ? "zoom-in" : "pointer" }}
    >
      {imageSrc && (
        <PreviewImage
          src={imageSrc}
          alt={metadata?.title || "Preview"}
          onError={() => setError(true)}
        />
      )}
      {metadata && (metadata.title || metadata.description) && (
        <PreviewContent>
          <PreviewTitle>{metadata.title}</PreviewTitle>
          <PreviewDesc>{metadata.description}</PreviewDesc>
          <Domain>
            <ExternalLink size={12} />
            {new URL(url).hostname}
          </Domain>
        </PreviewContent>
      )}
    </PreviewContainer>
  );
};
