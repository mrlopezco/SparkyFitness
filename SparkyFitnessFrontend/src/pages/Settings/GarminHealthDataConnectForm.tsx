import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  resolveGhdMfaId,
  isGhdLoginSuccess,
  isGhdMfaRequired,
  useLoginGarminHealthDataMutation,
  useResumeGarminHealthDataLoginMutation,
} from '@/hooks/Integrations/useGarminHealthData';

interface GarminHealthDataConnectFormProps {
  initialMfaId?: string | null;
  onMfaComplete?: () => void;
}

/**
 * Login + MFA for garmin_health_data. Credentials are sent only to obtain
 * tokens — never persisted in frontend state beyond this form.
 */
const GarminHealthDataConnectForm = ({
  initialMfaId,
  onMfaComplete,
}: GarminHealthDataConnectFormProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaId, setMfaId] = useState<string | null>(initialMfaId || null);
  const [showMfa, setShowMfa] = useState(!!initialMfaId);

  const { mutateAsync: login, isPending: loginPending } =
    useLoginGarminHealthDataMutation();
  const { mutateAsync: resumeLogin, isPending: resumePending } =
    useResumeGarminHealthDataLoginMutation();

  const loading = loginPending || resumePending;

  const handleLogin = async () => {
    if (!user) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'integrations.ghdNotAuthenticated',
          'User not authenticated. Please log in.'
        ),
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await login({ email, password });
      const nextMfaId = resolveGhdMfaId(result);

      if (isGhdMfaRequired(result) && nextMfaId) {
        setMfaId(nextMfaId);
        setShowMfa(true);
        toast({
          title: t('integrations.ghdMfaRequiredTitle', 'MFA Required'),
          description: t(
            'integrations.ghdMfaRequiredDescription',
            'Enter the MFA code from your Garmin Connect app.'
          ),
        });
      } else if (isGhdLoginSuccess(result)) {
        setShowMfa(false);
        setMfaCode('');
        setPassword('');
        onMfaComplete?.();
      }
    } catch {
      // toast handled by mutation meta
    }
  };

  const handleMfaSubmit = async () => {
    if (!user) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'integrations.ghdNotAuthenticated',
          'User not authenticated. Please log in.'
        ),
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await resumeLogin({
        mfa_id: mfaId,
        mfa_code: mfaCode,
      });
      if (result.status === 'success' || result.ok === true) {
        setShowMfa(false);
        setMfaCode('');
        setMfaId(null);
        setPassword('');
        onMfaComplete?.();
      }
    } catch {
      // toast handled by mutation meta
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'integrations.ghdCredentialNote',
          'Sparky Fitness does not store your Garmin email or password. They are used only during login to obtain secure tokens. Use Garmin Health Data for deep Training archive; keep classic Garmin for nutrition / workout definitions if needed.'
        )}
      </p>

      {!showMfa && !initialMfaId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleLogin();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ghd-email">
                {t('integrations.ghdEmailLabel', 'Garmin Email')}
              </Label>
              <Input
                id="ghd-email"
                type="email"
                placeholder={t(
                  'integrations.ghdEmailPlaceholder',
                  'Enter your Garmin email'
                )}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="ghd-password">
                {t('integrations.ghdPasswordLabel', 'Garmin Password')}
              </Label>
              <Input
                id="ghd-password"
                type="password"
                placeholder={t(
                  'integrations.ghdPasswordPlaceholder',
                  'Enter your Garmin password'
                )}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading}>
            {loading
              ? t('integrations.ghdConnecting', 'Connecting…')
              : t('integrations.ghdConnect', 'Connect Garmin Health Data')}
          </Button>
        </form>
      )}

      {showMfa && (
        <div className="space-y-3">
          <Label htmlFor="ghd-mfa-code">
            {t('integrations.ghdMfaLabel', 'Garmin MFA Code')}
          </Label>
          <Input
            id="ghd-mfa-code"
            type="text"
            placeholder={t(
              'integrations.ghdMfaPlaceholder',
              'Enter MFA code'
            )}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            disabled={loading}
          />
          <Button onClick={() => void handleMfaSubmit()} disabled={loading}>
            {loading
              ? t('integrations.ghdMfaSubmitting', 'Submitting…')
              : t('integrations.ghdMfaSubmit', 'Submit MFA Code')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default GarminHealthDataConnectForm;
