import React from "react";
import EmojiPickerReact, { EmojiClickData, Theme } from "emoji-picker-react";
import styled from "styled-components";

const PickerWrapper = styled.div`
  position: absolute;
  bottom: 60px;
  right: 20px;
  z-index: 1000;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  border-radius: 12px;

  .EmojiPickerReact {
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    background: #1a1a1a !important;
    --epr-category-label-bg-color: #1a1a1a !important;
    --epr-body-background-color: #1a1a1a !important;
    --epr-picker-border-color: #333 !important;
  }
`;

interface EmojiPickerProps {
  onEmojiClick: (emojiData: EmojiClickData) => void;
  onClose: () => void;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onEmojiClick,
  onClose,
}) => {
  return (
    <PickerWrapper>
      <div
        style={{ position: "fixed", inset: 0, zIndex: -1 }}
        onClick={onClose}
      />
      <EmojiPickerReact
        theme={Theme.DARK}
        onEmojiClick={onEmojiClick}
        lazyLoadEmojis={true}
      />
    </PickerWrapper>
  );
};
