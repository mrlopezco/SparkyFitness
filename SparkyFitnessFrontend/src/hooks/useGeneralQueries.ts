import {
  getCurrentVersion,
  getLatestGithubRelease,
  getLatestAnnouncement,
} from '@/api/general';
import { generalKeys } from '@/api/keys/general';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const useCurrentVersionQuery = () => {
  return useQuery({
    queryKey: generalKeys.appVersion,
    queryFn: getCurrentVersion,
    staleTime: Infinity,
  });
};

interface UseLatestReleaseOptions {
  enabled: boolean;
}

export const useLatestReleaseQuery = ({
  enabled = true,
}: UseLatestReleaseOptions) => {
  return useQuery({
    queryKey: generalKeys.githubVersion,
    queryFn: getLatestGithubRelease,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  });
};

export const useInvalidateGithubVersion = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: generalKeys.githubVersion });
  };
};

export const useAnnouncementQuery = ({
  enabled = true,
}: UseLatestReleaseOptions) => {
  return useQuery({
    queryKey: generalKeys.announcement,
    queryFn: getLatestAnnouncement,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  });
};
