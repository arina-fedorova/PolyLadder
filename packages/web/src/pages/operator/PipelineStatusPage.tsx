import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { FileText, GitBranch, CheckCircle2, AlertCircle } from 'lucide-react';

interface PipelineStats {
  drafts: number;
  candidates: number;
  validated: number;
  approved: {
    rules: number;
    exercises: number;
    meanings: number;
    utterances: number;
  };
}

export function PipelineStatusPage() {
  const { data: stats, isLoading } = useQuery<PipelineStats>({
    queryKey: ['pipeline-stats'],
    queryFn: async () => {
      const response = await apiClient.get<PipelineStats>('/operational/pipeline-stats');
      return response.data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const totalApproved =
    stats.approved.rules +
    stats.approved.exercises +
    stats.approved.meanings +
    stats.approved.utterances;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Content Pipeline Status</h1>
        <p className="text-gray-600 mt-1">
          Real-time view of content progression through the pipeline
        </p>
      </div>

      {/* Pipeline Flow Diagram */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold mb-6">Pipeline Flow</h2>
        <div className="flex items-center justify-between">
          {/* DRAFT */}
          <div className="flex-1 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-100 text-yellow-600 mb-2">
              <FileText className="w-10 h-10" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.drafts}</div>
            <div className="text-sm text-gray-600">DRAFTS</div>
            <div className="text-xs text-gray-500 mt-1">Raw content</div>
          </div>

          {/* Arrow */}
          <div className="flex-none text-gray-400">→</div>

          {/* CANDIDATE */}
          <div className="flex-1 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 text-blue-600 mb-2">
              <GitBranch className="w-10 h-10" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.candidates}</div>
            <div className="text-sm text-gray-600">CANDIDATES</div>
            <div className="text-xs text-gray-500 mt-1">Normalized</div>
          </div>

          {/* Arrow */}
          <div className="flex-none text-gray-400">→</div>

          {/* VALIDATED */}
          <div className="flex-1 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-100 text-purple-600 mb-2">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.validated}</div>
            <div className="text-sm text-gray-600">VALIDATED</div>
            <div className="text-xs text-gray-500 mt-1">Awaiting review</div>
          </div>

          {/* Arrow */}
          <div className="flex-none text-gray-400">→</div>

          {/* APPROVED */}
          <div className="flex-1 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 mb-2">
              <AlertCircle className="w-10 h-10" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalApproved}</div>
            <div className="text-sm text-gray-600">APPROVED</div>
            <div className="text-xs text-gray-500 mt-1">Ready for learners</div>
          </div>
        </div>
      </div>

      {/* Approved Content Breakdown */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold mb-4">Approved Content by Type</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
            <div className="text-sm text-blue-700 font-medium">Grammar Rules</div>
            <div className="text-3xl font-bold text-blue-900 mt-2">{stats.approved.rules}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
            <div className="text-sm text-purple-700 font-medium">Exercises</div>
            <div className="text-3xl font-bold text-purple-900 mt-2">
              {stats.approved.exercises}
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
            <div className="text-sm text-green-700 font-medium">Meanings</div>
            <div className="text-3xl font-bold text-green-900 mt-2">{stats.approved.meanings}</div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
            <div className="text-sm text-orange-700 font-medium">Utterances</div>
            <div className="text-3xl font-bold text-orange-900 mt-2">
              {stats.approved.utterances}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Health Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Processing Rate</div>
              <div className="text-lg font-semibold text-gray-900 mt-1">
                {stats.candidates > 0
                  ? `${Math.round((stats.validated / (stats.candidates + stats.validated)) * 100)}%`
                  : 'N/A'}
              </div>
            </div>
            <div className="text-blue-600">
              <GitBranch className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Approval Rate</div>
              <div className="text-lg font-semibold text-gray-900 mt-1">
                {stats.validated > 0
                  ? `${Math.round((totalApproved / (totalApproved + stats.validated)) * 100)}%`
                  : 'N/A'}
              </div>
            </div>
            <div className="text-green-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Items in Review</div>
              <div className="text-lg font-semibold text-gray-900 mt-1">{stats.validated}</div>
            </div>
            <div className="text-purple-600">
              <AlertCircle className="w-8 h-8" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
