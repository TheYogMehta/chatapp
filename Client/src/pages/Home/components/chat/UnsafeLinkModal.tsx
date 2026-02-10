import React from "react";
import styled from "styled-components";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
`;

const ModalContent = styled.div`
  background: #1f1f1f;
  border: 1px solid #dc2626;
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
  text-align: center;
`;

const Title = styled.h2`
  color: #dc2626;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

const Message = styled.p`
  color: #d1d5db;
  margin-bottom: 24px;
  line-height: 1.5;
`;

const UrlPreview = styled.div`
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 4px;
  color: #9ca3af;
  font-family: monospace;
  margin-bottom: 20px;
  word-break: break-all;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
`;

const Button = styled.button<{ variant?: "danger" | "secondary" }>`
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 600;
  background: ${(props) =>
    props.variant === "danger" ? "#dc2626" : "#374151"};
  color: white;

  &:hover {
    opacity: 0.9;
  }
`;

interface UnsafeLinkModalProps {
  url: string;
  type?: "unsafe" | "unknown";
  isLoading?: boolean;
  onConfirm: () => void;
  onTrust?: () => void;
  onCancel: () => void;
}

export const UnsafeLinkModal: React.FC<UnsafeLinkModalProps> = ({
  url,
  type = "unsafe",
  isLoading = false,
  onConfirm,
  onTrust,
  onCancel,
}) => {
  const isUnsafe = type === "unsafe";

  return (
    <ModalOverlay onClick={isLoading ? undefined : onCancel}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <Title>
          {isLoading ? (
            <Loader2 className="animate-spin" size={24} color="#60a5fa" />
          ) : (
            <AlertTriangle size={24} color={isUnsafe ? "#dc2626" : "#eab308"} />
          )}
          {isLoading
            ? "Checking Link Safety..."
            : isUnsafe
            ? "Potential Security Risk"
            : "External Link"}
        </Title>
        <Message>
          {isLoading
            ? "Please wait while we verify this link with our security server."
            : isUnsafe
            ? "The link you are trying to visit has been flagged as potentially unsafe. It may contain explicit content or malicious software."
            : "This link leads to an untrusted domain. Are you sure you want to visit?"}
        </Message>
        <UrlPreview>{url}</UrlPreview>
        <ButtonGroup>
          <Button variant="secondary" onClick={onCancel}>
            {isLoading ? "Cancel" : "Go Back"}
          </Button>
          {!isUnsafe && onTrust && !isLoading && (
            <Button
              variant="secondary"
              onClick={onTrust}
              style={{ background: "#4ade80", color: "#064e3b" }}
            >
              Trust Domain
            </Button>
          )}
          <Button
            variant={isUnsafe ? "danger" : "secondary"}
            onClick={onConfirm}
            style={{ opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading
              ? "Visit Anyway"
              : isUnsafe
              ? "Visit Anyway"
              : "Visit Once"}
          </Button>
        </ButtonGroup>
      </ModalContent>
    </ModalOverlay>
  );
};
