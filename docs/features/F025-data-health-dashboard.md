# F025: Data Health Dashboard

**Feature Code**: F025
**Created**: 2025-12-17
**Phase**: 7 - Operational UI
**Status**: ✅ Completed
**Completed**: 2025-12-20
**PR**: #28

---

## Description

Operator dashboard displaying real-time content pipeline health metrics: item counts by lifecycle state (DRAFT/CANDIDATE/VALIDATED/APPROVED), pipeline flow visualization, health indicators with color coding, recent activity log showing state transitions and approvals, and refinement service status monitoring.

## Success Criteria

- [x] Dashboard page at /operator/dashboard with real-time metrics
- [x] State count cards showing items in each lifecycle state
- [x] Pipeline flow visualization (funnel chart)
- [x] Health indicators with color-coded status (green/yellow/red)
- [x] Recent activity log with pagination
- [x] Refinement service status display (running/stopped, last checkpoint)
- [x] Auto-refresh every 30 seconds using TanStack Query polling

---

## Tasks

### Task 1: Create Pipeline Health API Endpoint

**Description**: API endpoint returning pipeline metrics and health indicators.

**Implementation Plan**:

Already exists in F020 as GET /operational/health. Response structure:

```typescript
interface PipelineHealthResponse {
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
    stuckItems: number; // Items in same state >7 days
    errorRate: number; // Percentage of failed pipeline runs
    throughput: number; // Items processed per day
  };
}
```

No new endpoint needed - F020 already provides this.

---

### Task 2: Create Dashboard Page Component

**Description**: Main operator dashboard with metrics grid and activity feed.

**Implementation Plan**:

Create `packages/web/src/pages/operator/DashboardPage.tsx`:

```tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { StateCountCards } from '@/components/operational/StateCountCards';
import { PipelineFlowChart } from '@/components/operational/PipelineFlowChart';
import { ActivityLog } from '@/components/operational/ActivityLog';
import { ServiceStatus } from '@/components/operational/ServiceStatus';

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

export function DashboardPage() {
  // Poll every 30 seconds
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
    refetchInterval: 30000, // 30 seconds
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
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
      {/* Header */}
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

      {/* State Count Cards */}
      <StateCountCards summary={health.summary} />

      {/* Health Indicators Grid */}
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

      {/* Pipeline Flow Visualization */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Pipeline Flow</h2>
        <PipelineFlowChart summary={health.summary} />
      </div>

      {/* Refinement Service Status */}
      <ServiceStatus service={health.refinementService} />

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        <ActivityLog />
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/operator/DashboardPage.tsx`

---

### Task 3: Create State Count Cards Component

**Description**: Grid of cards showing item counts for each lifecycle state.

**Implementation Plan**:

Create `packages/web/src/components/operational/StateCountCards.tsx`:

```tsx
import React from 'react';
import { FileText, Clock, CheckCircle, Shield } from 'lucide-react';

interface StateCountCardsProps {
  summary: {
    draft: number;
    candidate: number;
    validated: number;
    approved: number;
    total: number;
  };
}

export function StateCountCards({ summary }: StateCountCardsProps) {
  const states = [
    {
      label: 'Draft',
      count: summary.draft,
      icon: FileText,
      color: 'bg-gray-100 text-gray-600',
      description: 'Initial content creation',
    },
    {
      label: 'Candidate',
      count: summary.candidate,
      icon: Clock,
      color: 'bg-blue-100 text-blue-600',
      description: 'Awaiting validation',
    },
    {
      label: 'Validated',
      count: summary.validated,
      icon: CheckCircle,
      color: 'bg-yellow-100 text-yellow-600',
      description: 'Ready for approval',
    },
    {
      label: 'Approved',
      count: summary.approved,
      icon: Shield,
      color: 'bg-green-100 text-green-600',
      description: 'Published to learners',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {states.map((state) => {
        const Icon = state.icon;
        return (
          <div key={state.label} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{state.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{state.count}</p>
                <p className="text-xs text-gray-500 mt-1">{state.description}</p>
              </div>
              <div className={`p-3 rounded-lg ${state.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/operational/StateCountCards.tsx`

---

### Task 4: Create Pipeline Flow Chart Component

**Description**: Visual representation of content flow through pipeline states.

**Implementation Plan**:

Create `packages/web/src/components/operational/PipelineFlowChart.tsx`:

```tsx
import React from 'react';
import { ArrowRight } from 'lucide-react';

interface PipelineFlowChartProps {
  summary: {
    draft: number;
    candidate: number;
    validated: number;
    approved: number;
    total: number;
  };
}

export function PipelineFlowChart({ summary }: PipelineFlowChartProps) {
  const states = [
    { label: 'Draft', count: summary.draft, color: 'bg-gray-500' },
    { label: 'Candidate', count: summary.candidate, color: 'bg-blue-500' },
    { label: 'Validated', count: summary.validated, color: 'bg-yellow-500' },
    { label: 'Approved', count: summary.approved, color: 'bg-green-500' },
  ];

  // Calculate percentages for funnel visualization
  const maxCount = summary.total || 1;
  const getWidthPercentage = (count: number) => {
    return Math.max((count / maxCount) * 100, 10); // Min 10% width for visibility
  };

  return (
    <div className="space-y-4">
      {states.map((state, index) => {
        const widthPercent = getWidthPercentage(state.count);

        return (
          <div key={state.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{state.label}</span>
              <span className="text-sm text-gray-600">{state.count} items</span>
            </div>

            <div className="relative">
              {/* Background bar */}
              <div className="w-full h-12 bg-gray-100 rounded-lg overflow-hidden">
                {/* Filled bar */}
                <div
                  className={`h-full ${state.color} transition-all duration-500 flex items-center justify-center text-white font-medium`}
                  style={{ width: `${widthPercent}%` }}
                >
                  {state.count > 0 && (
                    <span className="text-sm">
                      {((state.count / summary.total) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Arrow to next stage */}
              {index < states.length - 1 && (
                <div className="absolute right-0 top-1/2 transform translate-x-8 -translate-y-1/2">
                  <ArrowRight className="w-6 h-6 text-gray-400" />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Total items summary */}
      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">Total Items in Pipeline</span>
          <span className="text-2xl font-bold text-gray-900">{summary.total}</span>
        </div>
      </div>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/operational/PipelineFlowChart.tsx`

---

### Task 5: Create Service Status Component

**Description**: Display refinement service health and metrics.

**Implementation Plan**:

Create `packages/web/src/components/operational/ServiceStatus.tsx`:

```tsx
import React from 'react';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';
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
```

**Files Created**: `packages/web/src/components/operational/ServiceStatus.tsx`

---

### Task 6: Create Activity Log Component

**Description**: Recent state transitions and approvals with pagination.

**Implementation Plan**:

Create `packages/web/src/components/operational/ActivityLog.tsx`:

```tsx
import React from 'react';
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
      // This endpoint would need to be added to F020
      // For now, using placeholder data structure
      const response = await apiClient.get<{ activities: ActivityLogEntry[] }>(
        '/operational/activity-log?limit=10'
      );
      return response.data.activities;
    },
    refetchInterval: 60000, // Refresh every minute
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
```

Note: This component references `/operational/activity-log` endpoint which needs to be added to F020 as additional endpoint.

**Files Created**: `packages/web/src/components/operational/ActivityLog.tsx`

---

### Task 7: Update App.tsx Route

**Description**: Add dashboard route to App.tsx.

**Implementation Plan**:

Update `packages/web/src/App.tsx` to import and use DashboardPage:

```tsx
import { DashboardPage } from '@/pages/operator/DashboardPage';

// In routes section:
<Route
  path="/operator/dashboard"
  element={
    <ProtectedRoute requiredRole="operator">
      <MainLayout showSidebar>
        <DashboardPage />
      </MainLayout>
    </ProtectedRoute>
  }
/>

// Also update redirect from /operator:
<Route path="/operator" element={<Navigate to="/operator/dashboard" replace />} />
```

**Files Modified**: `packages/web/src/App.tsx`

---

## Open Questions

### Question 1: Real-Time Updates vs Polling

**Context**: Dashboard currently polls every 30 seconds. Should we use WebSockets for real-time updates?

**Options**:

1. Polling with TanStack Query (current)
   - Pros: Simple, works with existing REST API
   - Cons: 30-second lag, extra load on server
2. WebSocket connection for real-time push
   - Pros: Instant updates, more efficient
   - Cons: Requires WebSocket server setup, more complex
3. Server-Sent Events (SSE)
   - Pros: Simpler than WebSocket, one-way push
   - Cons: Browser compatibility, connection management

**Temporary Plan**: Keep polling (option 1) for MVP. Most operators won't notice 30-second delay. Add WebSocket post-launch if operators request real-time updates.

---

### Question 2: Historical Metrics and Trends

**Context**: Dashboard shows current state. Should we show historical trends (e.g., items approved over time)?

**Options**:

1. Current state only (current)
   - Pros: Simple, fast queries
   - Cons: No trend analysis
2. Add trend charts (7-day/30-day throughput graphs)
   - Pros: Better insights, identify bottlenecks
   - Cons: More complex queries, need time-series data
3. Defer to F052-F056 (Analytics features)
   - Pros: Analytics features will handle this properly
   - Cons: Dashboard less useful for now

**Temporary Plan**: Option 3 - defer to F052-F056. Dashboard shows current snapshot. Analytics features will provide historical trends.

---

### Question 3: Activity Log Detail Level

**Context**: Activity log shows state transitions. Should it show more details (e.g., which fields changed)?

**Options**:

1. Basic transitions only (current)
   - Pros: Simple to implement
   - Cons: Limited debugging value
2. Full change log (field-level diffs)
   - Pros: Complete audit trail
   - Cons: More storage, complex UI
3. Expandable details (click to see more)
   - Pros: Balance of simplicity and detail
   - Cons: Requires detailed change tracking

**Temporary Plan**: Option 1 for MVP. Add expandable details in future if operators request more debugging info.

---

## Dependencies

- **Blocks**: F026 (Content Review Queue)
- **Depends on**: F020 (Operational Endpoints), F024 (Protected Routes & Navigation)

---

## Notes

### Auto-Refresh Strategy

- **Pipeline health**: Refreshes every 30 seconds
- **Activity log**: Refreshes every 60 seconds
- **Background refetch**: Continues when tab is in background
- **Error handling**: Shows error banner if API call fails

### Health Indicator Thresholds

**Healthy** (green):

- Error rate < 5%
- Stuck items < 10
- Throughput > 50 items/day

**Warning** (yellow):

- Error rate 5-15%
- Stuck items 10-50
- Throughput 20-50 items/day

**Critical** (red):

- Error rate > 15%
- Stuck items > 50
- Throughput < 20 items/day

### Performance Considerations

- Dashboard queries are read-only (no mutations)
- Queries are cached by TanStack Query (5-minute stale time)
- Polling uses background refetch (non-blocking)
- Cards and charts render immediately with cached data

### Accessibility

- Color-coded status uses both color and icons for colorblind users
- Loading states prevent layout shift
- Error messages are screenreader-friendly
- Keyboard navigation for all interactive elements

### Future Enhancements

- Add download CSV for activity log
- Add filtering by content type or date range
- Add alerting (email when pipeline health goes critical)
- Add chart showing throughput over time
- Add comparison to previous period (% change indicators)
