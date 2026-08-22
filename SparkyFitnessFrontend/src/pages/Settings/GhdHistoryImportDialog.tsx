import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, todayInZone } from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CalendarIcon, History, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useStartGhdHistoryImportMutation } from '@/hooks/Integrations/useGhdHistoryImport';

const PRESETS = [
  { days: 90, labelKey: 'integrations.ghdHistoryImport.last90Days' },
  { days: 365, labelKey: 'integrations.ghdHistoryImport.last365Days' },
  { days: 730, labelKey: 'integrations.ghdHistoryImport.last730Days' },
  { days: 1095, labelKey: 'integrations.ghdHistoryImport.last1095Days' },
] as const;

interface GhdHistoryImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const GhdHistoryImportDialog = ({
  isOpen,
  onClose,
}: GhdHistoryImportDialogProps) => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  const [startDay, setStartDay] = useState(() => addDays(today, -365));
  const { mutate: startImport, isPending } =
    useStartGhdHistoryImportMutation();

  const setPreset = (days: number) => {
    setStartDay(addDays(today, -days));
  };

  const handleStart = () => {
    startImport(
      { start_date: startDay },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  const startDate = parseISO(startDay);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-500" />
            {t(
              'integrations.ghdHistoryImport.title',
              'Fill history gaps'
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'integrations.ghdHistoryImport.description',
              'Backfill Garmin Health Data from a start date through today. Run this once for deep Training archive, then set sync frequency to daily for keep-alive.'
            )}
          </DialogDescription>
        </DialogHeader>

        <Alert
          variant="default"
          className="mt-2 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800"
        >
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-[10px] leading-tight text-yellow-700 dark:text-yellow-200">
            {t(
              'integrations.ghdHistoryImport.warning',
              'Large ranges are processed in weekly chunks and may take a long time. You can pause or cancel from the provider card.'
            )}
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 py-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(({ days, labelKey }) => (
              <Button
                key={days}
                variant={
                  startDay === addDays(today, -days) ? 'default' : 'outline'
                }
                size="sm"
                onClick={() => setPreset(days)}
                className="text-xs"
                disabled={isPending}
              >
                {t(labelKey, `Last ${days} days`)}
              </Button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ghd-history-start" className="text-xs font-semibold">
              {t(
                'integrations.ghdHistoryImport.startDate',
                'Start date'
              )}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="ghd-history-start"
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal',
                    !startDay && 'text-muted-foreground'
                  )}
                  disabled={isPending}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDay ? (
                    format(startDate, 'PP')
                  ) : (
                    <span>{t('common.pickADate', 'Pick a date')}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    if (!date) return;
                    setStartDay(format(date, 'yyyy-MM-dd'));
                  }}
                  disabled={(date) => date > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleStart} disabled={!startDay || isPending}>
            {isPending
              ? t('integrations.ghdHistoryImport.starting', 'Starting…')
              : t(
                  'integrations.ghdHistoryImport.start',
                  'Start gap fill'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GhdHistoryImportDialog;
