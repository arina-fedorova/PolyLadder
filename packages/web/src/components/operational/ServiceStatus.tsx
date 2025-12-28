import { Activity, AlertCircle, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ServiceStatusProps {
  service: {
    status: 'running' | 'stopped' | 'error';
    lastCheckpointAt: string | null;
    itemsProcessedToday: number;
    averageProcessingTimeMs: number;
  };
}

export function ServiceStatus({ service }: ServiceStatusProps) {
  const statusConfig = {
    running: {
      color: 'bg-green-100 text-green-800',
      icon: Activity,
      label: 'Running',
    },
    stopped: {
      color: 'bg-gray-100 text-gray-800',
      icon: Clock,
      label: 'Stopped',
    },
    error: {
      color: 'bg-red-100 text-red-800',
      icon: AlertCircle,
      label: 'Error',
    },
  };

  const config = statusConfig[service.status];
  const StatusIcon = config.icon;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Refinement Service</h2>
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${config.color}`}>
          <StatusIcon className="w-4 h-4" />
          <span className="text-sm font-medium">{config.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p className="text-sm text-gray-600">Last Checkpoint</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {service.lastCheckpointAt ? formatDate(service.lastCheckpointAt) : 'Never'}
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-600">Items Processed Today</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{service.itemsProcessedToday}</p>
        </div>

        <div>
          <p className="text-sm text-gray-600">Avg Processing Time</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {(service.averageProcessingTimeMs / 1000).toFixed(2)}s
          </p>
        </div>
      </div>

      {service.status === 'error' && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">
            Refinement service encountered an error. Check logs for details.
          </p>
        </div>
      )}

      {service.status === 'stopped' && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700">
            Refinement service is currently stopped. Content generation is paused.
          </p>
        </div>
      )}
    </div>
  );
}
