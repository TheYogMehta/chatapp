import styled from "@emotion/styled";
import { css, keyframes } from "@emotion/react";
import {
  colors,
  spacing,
  radii,
  typography,
  glassEffect,
  shadows,
} from "../../../../theme/design-system";

// Animations
const slideUp = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
`;

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
`;

// Chat Window Layout
export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  background-color: ${colors.background.primary};
`;

export const ChatHeader = styled.div`
  display: flex;
  align-items: center;
  padding: ${spacing[3]} ${spacing[4]};
  padding-top: max(${spacing[3]}, env(safe-area-inset-top));
  background-color: ${colors.background.secondary};
  border-bottom: 1px solid ${colors.border.subtle};
  z-index: 50;
  flex-shrink: 0;

  @media (max-width: 768px) {
    padding: ${spacing[2]} ${spacing[3]};
    padding-top: max(${spacing[2]}, env(safe-area-inset-top));
  }
`;

export const BackButton = styled.button`
  background: none;
  border: none;
  color: ${colors.text.secondary};
  padding: ${spacing[2]};
  margin-left: -${spacing[2]};
  margin-right: ${spacing[2]};
  cursor: pointer;
  border-radius: ${radii.full};
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background-color: ${colors.background.tertiary};
    color: ${colors.text.primary};
  }
`;

export const HeaderInfo = styled.div`
  flex: 1;
  min-width: 0;
  margin-left: ${spacing[3]};
`;

export const HeaderName = styled.div`
  font-size: ${typography.fontSize.lg};
  font-weight: ${typography.fontWeight.bold};
  color: ${colors.text.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const HeaderStatus = styled.div<{ isOnline?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  font-size: ${typography.fontSize.xs};
  color: ${colors.text.secondary};
  font-weight: ${typography.fontWeight.medium};

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: ${radii.full};
    background-color: ${(props) =>
    props.isOnline ? colors.status.success : colors.text.tertiary};
    box-shadow: ${(props) =>
    props.isOnline ? `0 0 8px ${colors.status.success}` : "none"};
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: ${spacing[3]};
`;

export const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing[4]};
  display: flex;
  flex-direction: column;
  gap: ${spacing[1]}; // Tighter gap for message groups
  overscroll-behavior-y: contain;

  @media (max-width: 768px) {
    padding: ${spacing[2]};
  }
`;

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
`;

// ... (Layout)

// Input Area
export const InputContainer = styled.div`
  padding: ${spacing[4]};
  padding-bottom: max(${spacing[4]}, env(safe-area-inset-bottom));
  background-color: ${colors.background.primary};
  display: flex;
  align-items: flex-end;
  gap: ${spacing[3]};
  position: relative;
  border-top: 1px solid ${colors.border.subtle};

  @media (max-width: 768px) {
     padding: ${spacing[2]};
     padding-bottom: max(${spacing[2]}, env(safe-area-inset-bottom));
     gap: ${spacing[2]};
  }
`;

export const InputWrapper = styled.div<{ isRateLimited?: boolean }>`
  flex: 1;
  background-color: ${colors.background.tertiary};
  border-radius: ${radii.xl};
  padding: ${spacing[3]} ${spacing[4]};
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  min-height: 48px;
  border: 1px solid
    ${(props) => (props.isRateLimited ? colors.status.error : "transparent")};
  transition: all 0.2s;
  ${(props) =>
    props.isRateLimited &&
    css`
      animation: ${shake} 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    `}

  &:focus-within {
    border-color: ${(props) =>
    props.isRateLimited ? colors.status.error : colors.primary.DEFAULT};
    box-shadow: 0 0 0 2px
      ${(props) =>
    props.isRateLimited ? "rgba(239, 68, 68, 0.2)" : colors.primary.subtle};
  }
`;

export const ChatInput = styled.textarea`
  flex: 1;
  background: none;
  border: none;
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.base};
  resize: none;
  max-height: 120px;
  padding: 0;
  outline: none;
  line-height: 1.5;

  &::placeholder {
    color: ${colors.text.tertiary};
  }
`;

export const SendButton = styled.button<{ isRecording?: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: ${radii.full};
  border: none;
  background-color: ${(props) =>
    props.isRecording ? colors.status.error : colors.primary.DEFAULT};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  ${(props) =>
    props.isRecording &&
    css`
      animation: ${pulse} 1.5s infinite;
    `}

  &:hover {
    transform: scale(1.05);
    background-color: ${(props) =>
    props.isRecording ? colors.status.error : colors.primary.hover};
  }

  &:active {
    transform: scale(0.95);
  }
`;

export const AttachmentButton = styled.button<{ active?: boolean }>`
  background: none;
  border: none;
  color: ${colors.text.secondary};
  padding: ${spacing[2]};
  cursor: pointer;
  border-radius: ${radii.full};
  transition: all 0.2s;
  transform: rotate(${(props) => (props.active ? "45deg" : "0deg")});

  &:hover {
    color: ${colors.text.primary};
    background-color: ${colors.background.tertiary};
  }
`;

// Attachment Menu
export const AttachmentMenu = styled.div`
  position: absolute;
  bottom: 80px;
  left: ${spacing[4]};
  background-color: ${colors.background.secondary};
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii.xl};
  padding: ${spacing[3]};
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${spacing[4]};
  box-shadow: ${shadows.xl};
  animation: ${slideUp} 0.2s ease-out;
  z-index: 100;
`;

export const MenuItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[2]};
  cursor: pointer;
  padding: ${spacing[2]};
  border-radius: ${radii.lg};

  &:hover {
    background-color: ${colors.background.tertiary};
  }
`;

export const MenuIcon = styled.div<{ color: string }>`
  width: 48px;
  height: 48px;
  border-radius: ${radii.full};
  background-color: ${(props) => props.color};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: transform 0.2s;

  ${MenuItem}:hover & {
    transform: scale(1.1);
  }
`;

export const MenuLabel = styled.span`
  font-size: ${typography.fontSize.xs};
  color: ${colors.text.secondary};
`;

// Reply Preview
export const ReplyPreview = styled.div`
  margin: 0 ${spacing[4]} ${spacing[2]};
  padding: ${spacing[3]};
  background-color: ${colors.background.tertiary};
  border-radius: ${radii.lg};
  border-left: 4px solid ${colors.primary.DEFAULT};
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  position: relative;
  animation: ${slideUp} 0.2s ease-out;
`;

export const ReplyContent = styled.div`
  flex: 1;
  min-width: 0;
`;

export const ReplySender = styled.div`
  font-size: ${typography.fontSize.xs};
  color: ${colors.primary.DEFAULT};
  font-weight: bold;
  margin-bottom: 2px;
`;

export const ReplyText = styled.div`
  font-size: ${typography.fontSize.sm};
  color: ${colors.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Message Bubble Styles
export const BubbleWrapper = styled.div<{ isMe: boolean }>`
  display: flex;
  justify-content: ${(props) => (props.isMe ? "flex-end" : "flex-start")};
  width: 100%;
  position: relative;
  padding-left: ${(props) => (props.isMe ? spacing[12] : "0")};
  padding-right: ${(props) => (props.isMe ? "0" : spacing[12])};
`;

export const Bubble = styled.div<{ isMe: boolean }>`
  background-color: ${(props) =>
    props.isMe ? "#005c4b" : colors.background.tertiary}; // WhatsApp-like dark green for me
  color: ${(props) => (props.isMe ? "#e9edef" : colors.text.primary)};
  padding: ${spacing[2]} ${spacing[3]};
  border-radius: ${(props) =>
    props.isMe
      ? `${radii.lg} 0 ${radii.lg} ${radii.lg}`
      : `0 ${radii.lg} ${radii.lg} ${radii.lg}`};
  max-width: 85%;
  position: relative;
  box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
  word-break: break-word;
  font-size: ${typography.fontSize.base};
  line-height: 1.4;

  @media (max-width: 768px) {
    font-size: ${typography.fontSize.sm};
    padding: 6px 9px;
    max-width: 80%;
  }

  a {
    color: ${(props) => (props.isMe ? "#53bdeb" : colors.primary.DEFAULT)};
    text-decoration: underline;
  }
`;

export const ReplyContext = styled.div`
  padding: ${spacing[2]};
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: ${radii.md};
  border-left: 3px solid rgba(255, 255, 255, 0.3);
  margin-bottom: ${spacing[1]};
  font-size: ${typography.fontSize.xs};
  display: flex;
  gap: ${spacing[2]};
  cursor: pointer;

  &:hover {
    background-color: rgba(0, 0, 0, 0.2);
  }
`;

export const ReplyButton = styled.button<{ isMe: boolean }>`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  ${(props) => (props.isMe ? `left: -40px;` : `right: -40px;`)}
  width: 32px;
  height: 32px;
  border-radius: ${radii.full};
  background-color: ${colors.background.tertiary};
  border: none;
  color: ${colors.text.secondary};
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  cursor: pointer;

  ${BubbleWrapper}:hover & {
    opacity: 1;
    ${(props) => (props.isMe ? `left: -36px;` : `right: -36px;`)}
  }

  &:hover {
    background-color: ${colors.background.tertiary};
    color: ${colors.text.primary};
  }
`;

export const FileAttachment = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[3]};
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: ${radii.lg};
  margin-bottom: ${spacing[1]};
`;

export const FileInfo = styled.div`
  flex: 1;
  overflow: hidden;
`;

export const FileName = styled.div`
  font-weight: 600;
  font-size: ${typography.fontSize.sm};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const FileStatus = styled.div`
  font-size: ${typography.fontSize.xs};
  opacity: 0.8;
  margin-top: 2px;
`;

// Media Styles
export const MediaContainer = styled.div`
  position: relative;
  border-radius: ${radii.lg};
  overflow: hidden;
  background-color: black;
  min-width: 200px;
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;

  img,
  video {
    max-width: 100%;
    max-height: 300px;
    display: block;
    border-radius: ${radii.lg};
  }
`;

export const DownloadOverlay = styled.div<{ isDownloading?: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${spacing[2]};
  background-color: rgba(0, 0, 0, 0.4);
  color: white;
  cursor: pointer;

  &:hover {
    background-color: rgba(0, 0, 0, 0.5);
  }
`;

export const MediaActionBtn = styled.button`
  position: absolute;
  bottom: ${spacing[2]};
  right: ${spacing[2]};
  width: 32px;
  height: 32px;
  border-radius: ${radii.full};
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.1);
    background-color: rgba(0, 0, 0, 0.8);
  }
`;

// Audio Player Styles
export const AudioContainer = styled.div<{ isMe: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
  width: 100%;
  max-width: 240px;
  overflow: hidden;
`;

export const AudioControls = styled.div<{ isMe: boolean }>`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  width: 100%;
`;

export const PlayPauseBtn = styled.div<{ isMe: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: ${radii.full};
  flex-shrink: 0;
  background-color: ${(props) =>
    props.isMe ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)"};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.05);
    background-color: ${(props) =>
    props.isMe ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)"};
  }
`;

export const WaveformContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 24px;
  overflow: hidden;
`;

export const WaveformBar = styled.div<{
  height: number;
  active: boolean;
  isMe: boolean;
}>`
  width: 3px;
  flex-shrink: 0;
  height: ${(props) => props.height * 100}%;
  border-radius: 2px;
  background-color: ${(props) =>
    props.active
      ? props.isMe
        ? "#a5b4fc"
        : "#64748b"
      : props.isMe
        ? "rgba(255, 255, 255, 0.4)"
        : "rgba(0, 0, 0, 0.1)"};
`;

export const SpeedButton = styled.div`
  font-size: ${typography.fontSize.xs};
  font-weight: bold;
  cursor: pointer;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
  opacity: 0.8;

  &:hover {
    opacity: 1;
  }
`;

export const AudioTimeInfo = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: ${typography.fontSize.xs};
  opacity: 0.7;
  padding: 0 ${spacing[1]};
`;
