import { styles } from "../../Home.styles";
import { SidebarItem } from "./SidebarItem";

export const Sidebar = ({
  sessions,
  activeChat,
  onSelect,
  onAddPeer,
  isOpen,
  isMobile,
  onClose,
  onLogoClick,
}: any) => (
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
          Ghost<span>Talk</span>
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
          sessions.map((sid: string) => (
            <SidebarItem
              key={sid}
              sid={sid}
              isActive={activeChat === sid}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <div style={styles.sidebarFooter}>
        <button onClick={onAddPeer} style={styles.addBtn}>
          <span>+</span> Add New Peer
        </button>
      </div>
    </nav>
  </>
);
