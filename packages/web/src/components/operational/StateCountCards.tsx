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
