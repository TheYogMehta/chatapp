import styled from "@emotion/styled";
import {
  colors,
  spacing,
  radii,
  shadows,
} from "../../../../theme/design-system";

export const SettingsContainer = styled.div`
  width: 800px;
  height: 600px;
  max-width: 95vw;
  max-height: 90vh;
  background-color: ${colors.background.primary};
  border-radius: ${radii.lg};
  display: flex;
  overflow: hidden;
  box-shadow: ${shadows["2xl"]};
  border: 1px solid ${colors.border.subtle};

  @media (max-width: 768px) {
    flex-direction: column;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
    border: none;
    padding-top: max(${spacing[5]}, env(safe-area-inset-top));
  }
`;

export const SettingsSidebar = styled.div`
  width: 250px;
  background-color: ${colors.background.secondary};
  padding: ${spacing[5]};
  border-right: 1px solid ${colors.border.subtle};
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    display: none;
  }
`;

export const SidebarHeader = styled.div`
  margin-bottom: 30px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const SidebarTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  color: ${colors.text.primary};
`;

export const BackButton = styled.button`
  background: none;
  border: none;
  color: ${colors.text.primary};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 50%;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${colors.background.tertiary};
  }
`;

export const SettingsContent = styled.div`
  flex: 1;
  padding: ${spacing[8]};
  overflow-y: auto;
  background-color: ${colors.background.primary};

  @media (max-width: 768px) {
    padding: ${spacing[4]};
    width: 100%;
    height: 100%;
  }
`;

export const CategoryButton = styled.button<{ isActive: boolean }>`
  padding: ${spacing[3]} ${spacing[4]};
  margin-bottom: ${spacing[2]};
  border-radius: ${radii.md};
  background-color: ${(props) =>
    props.isActive ? colors.primary.main : "transparent"};
  color: ${(props) => (props.isActive ? "white" : colors.text.secondary)};
  cursor: pointer;
  border: none;
  text-align: left;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s;

  &:hover {
    background-color: ${(props) =>
      props.isActive ? colors.primary.hover : colors.background.tertiary};
    color: ${(props) => (props.isActive ? "white" : colors.text.primary)};
  }
`;

export const MobileCategoryList = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${colors.background.primary};
`;

export const MobileHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[3]};
  padding: ${spacing[4]};
  border-bottom: 1px solid ${colors.border.subtle};
  background-color: ${colors.background.secondary};
  position: sticky;
  top: 0;
  z-index: 10;
`;

export const MobileTitle = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  color: ${colors.text.primary};
  font-weight: 600;
`;

export const MobileCategoryItem = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${spacing[5]} ${spacing[4]};
  background-color: ${colors.background.secondary};
  border: none;
  border-bottom: 1px solid ${colors.border.subtle};
  color: ${colors.text.primary};
  font-size: 1.1rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: ${colors.background.tertiary};
  }

  &:active {
    background-color: ${colors.background.tertiary};
    opacity: 0.8;
  }
`;

export const ProfileSection = styled.div`
  margin-bottom: ${spacing[8]};
  padding: ${spacing[5]};
  background-color: ${colors.background.secondary};
  border-radius: ${radii.md};

  @media (max-width: 768px) {
    padding: ${spacing[4]};
  }
`;

export const AccountItem = styled.div<{ isActive: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${spacing[4]};
  background-color: ${colors.background.secondary};
  border-radius: ${radii.md};
  margin-bottom: ${spacing[3]};
  border: 1px solid
    ${(props) => (props.isActive ? colors.primary.main : colors.border.subtle)};

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
    gap: ${spacing[3]};

    /* Inner container for avatar/email */
    & > div:first-of-type {
      width: 100%;
      overflow: hidden;
    }
  }
`;

export const DangerZone = styled.div`
  display: flex;
  gap: ${spacing[3]};
  margin-top: ${spacing[4]};
  flex-wrap: wrap;
`;

export const DangerButton = styled.button`
  padding: ${spacing[3]} ${spacing[5]};
  border-radius: ${radii.md};
  background-color: ${colors.status.error};
  color: white;
  border: none;
  cursor: pointer;
  font-weight: 600;

  &:hover {
    background-color: #dc2626;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// ... (previous layout components)

export const ProfileHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${spacing[4]};

    & > button {
      width: 100%;
    }
  }
`;

export const ProfileInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[5]};

  @media (max-width: 640px) {
    gap: ${spacing[3]};
  }
`;

export const EditProfileContainer = styled.div`
  margin-bottom: ${spacing[8]};
`;

export const EditProfileForm = styled.div`
  margin-bottom: ${spacing[5]};
  display: flex;
  gap: ${spacing[5]};
  align-items: center;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${spacing[4]};
  }
`;

export const EditProfileActions = styled.div`
  display: flex;
  gap: ${spacing[3]};
`;

export const CodeBlock = styled.div`
  padding: ${spacing[4]};
  background-color: ${colors.background.primary};
  border-radius: ${radii.md};
  border: 1px solid ${colors.border.subtle};
  display: flex;
  flex-wrap: wrap;
  gap: ${spacing[2]};
  font-family: monospace;
`;

export const SecuritySection = styled.div`
  margin-bottom: ${spacing[5]};
  padding: ${spacing[4]};
  background-color: ${colors.background.secondary};
  border-radius: ${radii.md};
`;

export const SecurityRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${spacing[3]};

    & > button {
      width: 100%;
    }
  }
`;

export const BackupContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[3]};
`;

export const SignOutButton = styled.button`
  padding: ${spacing[3]} ${spacing[5]};
  border-radius: ${radii.md};
  background-color: ${colors.background.tertiary};
  color: ${colors.text.primary};
  border: none;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s ease, color 0.2s ease;

  &:hover {
    background-color: ${colors.surface.highlight};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
