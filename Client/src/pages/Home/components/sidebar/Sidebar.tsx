import { styles } from "../../Home.styles";
import { SidebarItem } from "./SidebarItem";
import { SessionData } from "../../types";

export const Sidebar = ({
  sessions,
  activeChat,
  onSelect,
  onAddPeer,
  isOpen,
  isMobile,
  onClose,
  onLogoClick,
}: {
  sessions: SessionData[];
  activeChat: string | null;
  onSelect: (sid: string) => void;
  onAddPeer: () => void;
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
  onLogoClick: () => void;
}) => (
  <>
    {isOpen && isMobile && (
      <div onClick={onClose} style={styles.mobileOverlay} />
    )}
    <nav
      style={{
        ...styles.sidebar,
        left: isMobile ? (isOpen ? 0 : "-100%") : 0,
        position: isMobile ? "fixed" : "relative",
      }}
    >
      <div style={styles.sidebarHeader}>
        <h2 style={styles.logo} onClick={onLogoClick}>
          Chat<span>app</span>
        </h2>
        {isMobile && (
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        )}
      </div>

      <div style={styles.sessionList}>
        <p style={styles.sectionLabel}>SECURE SESSIONS</p>

        {sessions.length === 0 ? (
          <p style={styles.emptyText}>No active links</p>
        ) : (
          sessions.map((session) => (
            <SidebarItem
              key={session.sid}
              data={session}
              isActive={activeChat === session.sid}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <div style={styles.sidebarFooter}>
        <button onClick={onAddPeer} style={styles.addBtn}>
          <span>+</span> Connect via Email
        </button>
      </div>
    </nav>
  </>
);
