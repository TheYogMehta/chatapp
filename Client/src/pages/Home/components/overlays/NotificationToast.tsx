import React, { useState, useRef } from "react";
import { X } from "lucide-react";

interface NotificationToastProps {
  type: "error" | "info" | "success";
  message: string;
  onClose: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  type,
  message,
  onClose,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const startX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const bgColor =
    type === "error" ? "#ef4444" : type === "success" ? "#22c55e" : "#3b82f6";

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || startX.current === null) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.current;
    setTranslateX(diff);
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (Math.abs(translateX) > 100) {
      setTranslateX(translateX > 0 ? 500 : -500);
      setTimeout(onClose, 200);
    } else {
      setTranslateX(0);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "fixed",
        top: "20px",
        left: "50%",
        width: "90%",
        maxWidth: "400px",
        backgroundColor: bgColor,
        color: "white",
        padding: "16px",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        transform: `translateX(calc(-50% + ${translateX}px))`,
        transition: isDragging.current ? "none" : "transform 0.2s ease-out",
        opacity: Math.max(0, 1 - Math.abs(translateX) / 300),
        cursor: "grab",
      }}
    >
      <span
        style={{
          fontSize: "14px",
          fontWeight: 500,
          flex: 1,
          marginRight: "12px",
        }}
      >
        {message}
      </span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          padding: "4px",
          color: "white",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          opacity: 0.8,
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
};
