import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { StateCountCards } from '@/components/operational/StateCountCards';
import { PipelineFlowChart } from '@/components/operational/PipelineFlowChart';
import { ActivityLog } from '@/components/operational/ActivityLog';
import { ServiceStatus } from '@/components/operational/ServiceStatus';
import { FailureTrendsChart } from '@/components/operational/FailureTrendsChart';
import { TransformationJobsList } from '@/components/operational/TransformationJobsList';

interface PipelineHealth {
  summary: {
    draft: number;
    candidate: number;
    validated: number;
    approved: number;
    total: number;
  };
  byContentType: {
    vocabulary: { draft: number; candidate: number; validated: number; approved: number };
    grammar: { draft: number; candidate: number; validated: number; approved: number };
    orthography: { draft: number; candidate: number; validated: number; approved: number };
  };
  refinementService: {
    status: 'running' | 'stopped' | 'error';
    lastCheckpointAt: string | null;
    itemsProcessedToday: number;
    averageProcessingTimeMs: number;
  };
  healthIndicators: {
    overall: 'healthy' | 'warning' | 'critical';
    stuckItems: number;
    errorRate: number;
    throughput: number;
  };
}

function DashboardContent() {
  const {
    data: health,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['pipeline-health'],
    queryFn: async () => {
      const response = await apiClient.get<PipelineHealth>('/operational/health');
      return response.data;
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load dashboard metrics</p>
      </div>
    );
  }

  const healthColor =
    health.healthIndicators.overall === 'healthy'
      ? 'text-green-600'
      : health.healthIndicators.overall === 'warning'
        ? 'text-yellow-600'
        : 'text-red-600';

  const HealthIcon =
    health.healthIndicators.overall === 'healthy'
      ? CheckCircle
      : health.healthIndicators.overall === 'warning'
        ? Clock
        : AlertCircle;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pipeline Dashboard</h1>
          <p className="text-gray-600 mt-1">Real-time content pipeline health and metrics</p>
        </div>
        <div className={`flex items-center space-x-2 ${healthColor}`}>
          <HealthIcon className="w-6 h-6" />
          <span className="font-medium capitalize">{health.healthIndicators.overall}</span>
        </div>
      </div>

      <StateCountCards summary={health.summary} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Stuck Items</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {health.healthIndicators.stuckItems}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Items unchanged &gt;7 days</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Error Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {health.healthIndicators.errorRate.toFixed(1)}%
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Failed pipeline runs</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Throughput</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {health.healthIndicators.throughput}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-xs text-gray-500 mt-2">Items processed/day</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Pipeline Flow</h2>
        <PipelineFlowChart summary={health.summary} />
      </div>

      <ServiceStatus service={health.refinementService} />

      <FailureTrendsChart />

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Transformation Jobs</h2>
        <TransformationJobsList />
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        <ActivityLog />
      </div>
    </div>
  );
}

export function OperatorDashboardPage() {
  return <DashboardContent />;
}
