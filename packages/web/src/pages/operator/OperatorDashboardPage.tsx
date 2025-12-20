import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';

export function OperatorDashboardPage() {
  return (
    <MainLayout showSidebar>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Operator Dashboard</h1>
        <p className="mt-4 text-gray-600">Content moderation and pipeline management</p>
      </div>
    </MainLayout>
  );
}
