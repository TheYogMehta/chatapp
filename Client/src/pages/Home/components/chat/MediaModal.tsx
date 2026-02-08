import React, { useState, useRef, useEffect } from "react";
import styled, { keyframes, css } from "styled-components";
import { X, ZoomIn, ZoomOut, Download, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { colors, radii, spacing, glassEffect } from "../../../theme/design-system";

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const scaleIn = keyframes`
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(10px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  animation: ${fadeIn} 0.2s ease-out;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${spacing[4]};
  background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
  z-index: 10;
`;

const Title = styled.h3`
  color: white;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  opacity: 0.9;
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: ${radii.full};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const ContentArea = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
`;

const ImageContainer = styled.div<{ transform: string }>`
  transition: transform 0.1s ease-out;
  transform: ${(props) => props.transform};
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  
  img {
    max-width: 100vw;
    max-height: 100vh;
    object-fit: contain;
    user-select: none;
    pointer-events: none; 
    /* Prevent default drag behavior to allow custom pan */
  }
`;

const VideoContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  
  video {
    max-width: 100%;
    max-height: 100%;
    outline: none;
  }
`;

const Controls = styled.div`
  position: absolute;
  bottom: ${spacing[8]};
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: ${spacing[4]};
  background: rgba(0, 0, 0, 0.6);
  padding: ${spacing[3]} ${spacing[5]};
  border-radius: ${radii.full};
  backdrop-filter: blur(5px);
`;

const ControlButton = styled.button`
  background: none;
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.8;
  
  &:hover {
    opacity: 1;
    transform: scale(1.1);
  }
`;

interface MediaModalProps {
    isOpen: boolean;
    onClose: () => void;
    media: {
        type: "image" | "video";
        url: string;
        description?: string;
        mimeType?: string;
    } | null;
}

export const MediaModal: React.FC<MediaModalProps> = ({ isOpen, onClose, media }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen]);

    if (!isOpen || !media) return null;

    const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 4));
    const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 1));

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY * -0.01;
            setScale((s) => Math.min(Math.max(s + delta, 1), 4));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && scale > 1) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    return (
        <Overlay onClick={onClose}>
            <Header onClick={(e) => e.stopPropagation()}>
                <Title>{media.description || "Media Viewer"}</Title>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {media.type === 'image' && (
                        <CloseButton onClick={() => {
                            const a = document.createElement('a');
                            a.href = media.url;
                            a.download = media.description || 'download';
                            a.click();
                        }}>
                            <Download size={20} />
                        </CloseButton>
                    )}
                    <CloseButton onClick={onClose}>
                        <X size={24} />
                    </CloseButton>
                </div>
            </Header>

            <ContentArea
                onClick={onClose}
                onWheel={handleWheel}
            >
                <div onClick={(e) => e.stopPropagation()}>
                    {media.type === "image" ? (
                        <ImageContainer
                            transform={`translate(${position.x}px, ${position.y}px) scale(${scale})`}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <img src={media.url} alt={media.description} draggable={false} />
                        </ImageContainer>
                    ) : (
                        <VideoContainer>
                            {/* Using standard controls for better stability across platforms, can customize later */}
                            <video
                                ref={videoRef}
                                src={media.url}
                                controls
                                autoPlay
                                playsInline
                                style={{ maxHeight: '80vh', maxWidth: '100%' }}
                            />
                        </VideoContainer>
                    )}
                </div>
            </ContentArea>

            {media.type === "image" && (
                <Controls onClick={(e) => e.stopPropagation()}>
                    <ControlButton onClick={handleZoomOut}>
                        <ZoomOut size={24} />
                    </ControlButton>
                    <span style={{ color: "white", minWidth: "40px", textAlign: "center" }}>
                        {Math.round(scale * 100)}%
                    </span>
                    <ControlButton onClick={handleZoomIn}>
                        <ZoomIn size={24} />
                    </ControlButton>
                </Controls>
            )}
        </Overlay>
    );
};
