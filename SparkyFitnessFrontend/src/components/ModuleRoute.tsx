import { Navigate } from 'react-router-dom';
import type { ForkModuleId } from '@workspace/shared';
import { useEffectiveModules } from '@/hooks/Settings/useModulePreferences';

interface ModuleRouteProps {
  moduleId: ForkModuleId;
  children: React.ReactNode;
}

/**
 * Blocks deep links to a disabled fork module (redirects to Diary).
 */
export function ModuleRoute({ moduleId, children }: ModuleRouteProps) {
  const modules = useEffectiveModules();
  if (!modules[moduleId]) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
