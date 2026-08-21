import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import type { ForkModuleId } from '@workspace/shared';
import { AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FORK_MODULE_DEFINITIONS } from '@/config/forkModules';
import {
  useEffectiveModules,
  useUpdateModulePreferencesMutation,
} from '@/hooks/Settings/useModulePreferences';

const MODULE_LABEL_KEYS: Record<
  ForkModuleId,
  {
    labelKey: string;
    labelDefault: string;
    helpKey: string;
    helpDefault: string;
  }
> = {
  exercises: {
    labelKey: 'settings.moduleVisibility.modules.exercises',
    labelDefault: 'Exercises',
    helpKey: 'settings.moduleVisibility.modules.exercisesHelp',
    helpDefault: 'Exercise library and related navigation.',
  },
  medications: {
    labelKey: 'settings.moduleVisibility.modules.medications',
    labelDefault: 'Medications',
    helpKey: 'settings.moduleVisibility.modules.medicationsHelp',
    helpDefault: 'Medications library and related navigation.',
  },
  training_plan: {
    labelKey: 'settings.moduleVisibility.modules.trainingPlan',
    labelDefault: 'Training Plan',
    helpKey: 'settings.moduleVisibility.modules.trainingPlanHelp',
    helpDefault:
      'Training plans with goals, commitments, an AI-drafted session calendar and adherence tracking.',
  },
};

export default function ModuleVisibilitySettings() {
  const { t } = useTranslation();
  const modules = useEffectiveModules();
  const updateMutation = useUpdateModulePreferencesMutation();

  const handleToggle = (id: ForkModuleId, enabled: boolean) => {
    updateMutation.mutate({ [id]: enabled });
  };

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.moduleVisibility.description',
          'Show or hide major app modules in navigation and routes.'
        )}
      >
        <LayoutGrid className="h-5 w-5" />
        {t('settings.moduleVisibility.title', 'Module Visibility')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.moduleVisibility.note',
            'Disabled modules are hidden from the menu and blocked if opened directly. Diary widgets and APIs are unchanged.'
          )}
        </p>
        <div className="space-y-4">
          {FORK_MODULE_DEFINITIONS.filter((def) => def.showInSettings).map(
            (def) => {
              const copy = MODULE_LABEL_KEYS[def.id];
              const checked = modules[def.id];
              return (
                <div
                  key={def.id}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <Label htmlFor={`module-${def.id}`}>
                      {t(copy.labelKey, copy.labelDefault)}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(copy.helpKey, copy.helpDefault)}
                    </p>
                  </div>
                  <Switch
                    id={`module-${def.id}`}
                    checked={checked}
                    disabled={updateMutation.isPending}
                    onCheckedChange={(val) => handleToggle(def.id, val)}
                  />
                </div>
              );
            }
          )}
        </div>
      </AccordionContent>
    </>
  );
}
