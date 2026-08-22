export const garminKeys = {
  status: ['garminStatus'] as const,
};

export const ghdKeys = {
  all: ['garminHealthData'] as const,
  status: ['garminHealthData', 'status'] as const,
  historyImport: ['garminHealthData', 'historyImport'] as const,
  coverage: ['garminHealthData', 'coverage'] as const,
};

export const wearableCoverageKeys = {
  all: ['wearableCoverage'] as const,
  bySource: (source: string) => ['wearableCoverage', source] as const,
};
