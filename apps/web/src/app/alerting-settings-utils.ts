export interface AlertConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
  unit: string;
}

export function toggleAlert(alerts: AlertConfig[], id: string): AlertConfig[] {
  return alerts.map(alert => 
    alert.id === id ? { ...alert, enabled: !alert.enabled } : alert
  );
}

export function updateAlertThreshold(alerts: AlertConfig[], id: string, value: string | number): AlertConfig[] {
  const numValue = typeof value === 'string' ? parseInt(value, 10) || 0 : value;
  return alerts.map(alert => 
    alert.id === id ? { ...alert, threshold: numValue } : alert
  );
}

export function validateAlerts(alerts: AlertConfig[]): string | null {
  for (const alert of alerts) {
    if (alert.enabled) {
      if (isNaN(alert.threshold) || alert.threshold < 0) {
        return `Invalid threshold for ${alert.name}. Must be a non-negative number.`;
      }
      if (alert.unit === '%' && alert.threshold > 100) {
        return `Threshold for ${alert.name} cannot exceed 100%.`;
      }
    }
  }
  return null;
}
