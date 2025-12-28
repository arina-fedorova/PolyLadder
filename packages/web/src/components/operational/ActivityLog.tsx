import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { formatDate } from '@/lib/utils';
import { ArrowRight, CheckCircle, XCircle } from 'lucide-react';

interface ActivityLogEntry {
  id: string;
  itemType: 'vocabulary' | 'grammar' | 'orthography';
  itemId: string;
  fromState: string;
  toState: string;
  operatorEmail?: string;
  timestamp: string;
  action: 'approved' | 'rejected' | 'auto-promoted';
}

export function ActivityLog() {
  const { data, isLoading } = useQuery({
    queryKey: ['activity-log'],
    queryFn: async () => {
      const response = await apiClient.get<{ activities: ActivityLogEntry[] }>(
        '/operational/activity-log?limit=10'
      );
      return response.data.activities;
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading activity...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="text-gray-500">No recent activity</div>;
  }

  return (
    <div className="space-y-3">
      {data.map((entry) => {
        const actionIcon =
          entry.action === 'approved' ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : entry.action === 'rejected' ? (
            <XCircle className="w-5 h-5 text-red-500" />
          ) : (
            <ArrowRight className="w-5 h-5 text-blue-500" />
          );

        return (
          <div
            key={entry.id}
            className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="mt-1">{actionIcon}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-900 capitalize">
                  {entry.itemType}
                </span>
                <span className="text-xs text-gray-500">#{entry.itemId.slice(0, 8)}</span>
              </div>

              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs px-2 py-1 bg-white rounded text-gray-600 capitalize">
                  {entry.fromState}
                </span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="text-xs px-2 py-1 bg-white rounded text-gray-600 capitalize">
                  {entry.toState}
                </span>
              </div>

              {entry.operatorEmail && (
                <p className="text-xs text-gray-500 mt-1">by {entry.operatorEmail}</p>
              )}
            </div>

            <div className="text-right">
              <p className="text-xs text-gray-500">{formatDate(entry.timestamp)}</p>
            </div>
          </div>
        );
      })}

      <div className="pt-4 border-t border-gray-200">
        <a
          href="/operator/activity"
          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          View full activity log →
        </a>
      </div>
    </div>
  );
}
