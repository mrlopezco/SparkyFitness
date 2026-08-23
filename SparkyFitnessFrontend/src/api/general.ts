import { ReleaseInfo } from '@/components/NewReleaseDialog';
import { apiCall } from './api';
interface VersionResponse {
  version: string;
}
export const getCurrentVersion = async (): Promise<VersionResponse> => {
  return apiCall('/version/current', {
    method: 'GET',
  });
};
export interface LatestReleaseResponse {
  version: string;
  isNewVersionAvailable: boolean;
}
export const getLatestGithubRelease = async (): Promise<ReleaseInfo> => {
  return apiCall('/version/latest-github', {
    method: 'GET',
  });
};

export interface AnnouncementInfo {
  id: string;
  active: boolean;
  title: string;
  message: string;
  publishedAt?: string;
  htmlUrl?: string;
}

export const getLatestAnnouncement = async (): Promise<AnnouncementInfo> => {
  return apiCall('/announcement/current', {
    method: 'GET',
  });
};
