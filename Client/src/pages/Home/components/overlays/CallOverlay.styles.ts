import styled from "@emotion/styled";
import { css, keyframes } from "@emotion/react";
import {
  colors,
  glassEffect,
  radii,
  shadows,
  spacing,
  typography,
} from "../../../../theme/design-system";

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
  70% { box-shadow: 0 0 0 20px rgba(99, 102, 241, 0); }
  100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
`;

export const OverlayContainer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 3000;
  background-color: ${colors.background.overlay};
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

export const CallCard = styled.div`
  ${glassEffect};
  padding: ${spacing[10]};
  border-radius: ${radii.xl};
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: ${shadows.xl};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing[6]};
`;

export const AvatarContainer = styled.div<{ isCalling?: boolean }>`
  width: 120px;
  height: 120px;
  border-radius: ${radii.full};
  background: linear-gradient(
    135deg,
    ${colors.primary.DEFAULT},
    ${colors.primary.active}
  );
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typography.fontSize["3xl"]};
  font-weight: ${typography.fontWeight.bold};
  color: white;
  border: 4px solid ${colors.background.secondary};
  margin-bottom: ${spacing[4]};
  ${(props) =>
    props.isCalling &&
    css`
      animation: ${pulse} 2s infinite;
    `}
`;

export const CallerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
`;

export const CallerName = styled.h2`
  margin: 0;
  font-size: ${typography.fontSize["2xl"]};
  font-weight: ${typography.fontWeight.bold};
  color: ${colors.text.primary};
`;

export const CallStatus = styled.p`
  margin: 0;
  font-size: ${typography.fontSize.base};
  color: ${colors.text.secondary};
`;

export const ControlsRow = styled.div`
  display: flex;
  gap: ${spacing[8]};
  justify-content: center;
  align-items: center;
  margin-top: ${spacing[4]};
`;

export const MinimizedContainer = styled.div<{
  position: { x: number; y: number };
}>`
  position: fixed;
  left: ${(props) => props.position.x}px;
  top: ${(props) => props.position.y}px;
  width: 240px;
  height: 180px;
  background-color: ${colors.background.secondary};
  border-radius: ${radii.lg};
  box-shadow: ${shadows.lg};
  border: 1px solid ${colors.border.subtle};
  z-index: 3001;
  overflow: hidden;
  cursor: grab;
  display: flex;
  flex-direction: column;

  &:active {
    cursor: grabbing;
    box-shadow: ${shadows.xl};
  }
`;

export const VideoPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  background-color: black;
  display: relative;
`;

export const MaximizeButton = styled.button`
  position: absolute;
  top: ${spacing[2]};
  right: ${spacing[2]};
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: white;
  border-radius: ${radii.sm};
  padding: ${spacing[1]};
  cursor: pointer;
  z-index: 10;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
`;

// Full Screen Video View
export const FullScreenContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding-bottom: ${spacing[10]};
`;

export const MainVideoArea = styled.div`
  flex: 1;
  width: 100%;
  max-width: 1200px;
  max-height: 80vh;
  margin: ${spacing[4]} 0;
  background-color: black;
  border-radius: ${radii.xl};
  overflow: hidden;
  position: relative;
  box-shadow: ${shadows.xl};
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const RemoteVideo = styled.div`
  width: 100%;
  height: 100%;

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const MinimizeButton = styled.div`
  position: absolute;
  top: ${spacing[10]};
  left: ${spacing[10]};
  cursor: pointer;
  color: white;
  opacity: 0.7;
  z-index: 10;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
`;
