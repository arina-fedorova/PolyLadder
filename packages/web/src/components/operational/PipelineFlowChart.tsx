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

  const maxCount = summary.total || 1;
  const getWidthPercentage = (count: number) => {
    if (count === 0) return 0;
    return (count / maxCount) * 100;
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
              <div className="w-full h-12 bg-gray-100 rounded-lg overflow-hidden">
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

              {index < states.length - 1 && (
                <div className="absolute right-0 top-1/2 transform translate-x-8 -translate-y-1/2">
                  <ArrowRight className="w-6 h-6 text-gray-400" />
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">Total Items in Pipeline</span>
          <span className="text-2xl font-bold text-gray-900">{summary.total}</span>
        </div>
      </div>
    </div>
  );
}
