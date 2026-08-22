import WearableCoverageDialog from './WearableCoverageDialog';

/** @deprecated Prefer WearableCoverageDialog with source="garmin_health_data" */
const GhdCoverageDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => (
  <WearableCoverageDialog
    isOpen={isOpen}
    onClose={onClose}
    source="garmin_health_data"
  />
);

export default GhdCoverageDialog;
