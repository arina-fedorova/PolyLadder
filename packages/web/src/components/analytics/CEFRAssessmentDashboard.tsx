import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  Award,
  Target,
  Clock,
  BookOpen,
  GraduationCap,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { cefrAnalyticsApi, CEFRLevelData } from '@/api/analytics';

const CEFR_COLORS: Record<string, string> = {
  A0: '#a5b4fc',
  A1: '#818cf8',
  A2: '#6366f1',
  B1: '#4f46e5',
  B2: '#4338ca',
  C1: '#3730a3',
  C2: '#312e81',
};

const STATUS_COLORS = {
  progressing: 'bg-amber-100 text-amber-800',
  ready: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
};

const STATUS_LABELS = {
  progressing: 'In Progress',
  ready: 'Ready for Next Level',
  completed: 'Mastered',
};

interface CEFRAssessmentDashboardProps {
  language: string;
}

export function CEFRAssessmentDashboard({ language }: CEFRAssessmentDashboardProps) {
  const [progressionDays, setProgressionDays] = useState<30 | 60 | 90>(90);

  const {
    data: assessment,
    isLoading: assessmentLoading,
    error: assessmentError,
  } = useQuery({
    queryKey: ['cefr-assessment', language],
    queryFn: () => cefrAnalyticsApi.getAssessment(language),
    refetchInterval: 60000,
  });

  const {
    data: progression,
    isLoading: progressionLoading,
    error: progressionError,
  } = useQuery({
    queryKey: ['cefr-progression', language, progressionDays],
    queryFn: () => cefrAnalyticsApi.getProgression(language, progressionDays),
    refetchInterval: 60000,
  });

  const {
    data: requirements,
    isLoading: requirementsLoading,
    error: requirementsError,
  } = useQuery({
    queryKey: ['cefr-requirements', language],
    queryFn: () => cefrAnalyticsApi.getRequirements(language),
    refetchInterval: 60000,
    enabled: !!assessment?.nextLevel,
  });

  if (assessmentLoading || progressionLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (assessmentError || progressionError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load CEFR assessment data</p>
      </div>
    );
  }

  if (!assessment) {
    return null;
  }

  const currentLevelData = assessment.levelDetails.find((l) => l.level === assessment.currentLevel);

  const completedLevels = assessment.levelDetails.filter((l) => l.isCompleted).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">CEFR Level Assessment</h1>
        <p className="text-gray-600 mt-1">Track your language proficiency progress</p>
      </div>

      {/* Current Level & Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Current Level</p>
              <p
                className="text-4xl font-bold mt-1"
                style={{ color: CEFR_COLORS[assessment.currentLevel] }}
              >
                {assessment.currentLevel}
              </p>
            </div>
            <GraduationCap
              className="w-10 h-10"
              style={{ color: CEFR_COLORS[assessment.currentLevel] }}
            />
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[assessment.status]}`}
            >
              {STATUS_LABELS[assessment.status]}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Levels Completed</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{completedLevels} / 7</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedLevels / 7) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Next Level</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {assessment.nextLevel || 'N/A'}
              </p>
            </div>
            <Target className="w-8 h-8 text-primary-600" />
          </div>
          {assessment.nextLevel && (
            <p className="text-xs text-gray-500 mt-2">
              {assessment.progressToNextLevel.toFixed(1)}% progress
            </p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Est. Days to Next</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {assessment.estimatedDaysToNextLevel !== null
                  ? assessment.estimatedDaysToNextLevel
                  : '-'}
              </p>
            </div>
            <Clock className="w-8 h-8 text-gray-600" />
          </div>
          {assessment.estimatedDaysToNextLevel !== null && (
            <p className="text-xs text-gray-500 mt-2">Based on current pace</p>
          )}
        </div>
      </div>

      {/* Current Level Progress */}
      {currentLevelData && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {assessment.currentLevel} Level Progress
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vocabulary Progress */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary-600" />
                  <span className="font-medium text-gray-700">Vocabulary</span>
                </div>
                <span className="text-sm text-gray-600">
                  {currentLevelData.vocabularyMastered} / {currentLevelData.vocabularyTotal}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-primary-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${currentLevelData.vocabularyPercentage}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {currentLevelData.vocabularyPercentage}% mastered (80% required)
              </p>
            </div>

            {/* Grammar Progress */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-gray-700">Grammar</span>
                </div>
                <span className="text-sm text-gray-600">
                  {currentLevelData.grammarCompleted} / {currentLevelData.grammarTotal}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-amber-500 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${currentLevelData.grammarPercentage}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {currentLevelData.grammarPercentage}% completed (70% required)
              </p>
            </div>
          </div>

          {/* Overall Progress */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-700">Overall Progress</span>
              <span className="text-lg font-bold text-gray-900">
                {currentLevelData.overallPercentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-6">
              <div
                className="h-6 rounded-full transition-all duration-300"
                style={{
                  width: `${currentLevelData.overallPercentage}%`,
                  backgroundColor: CEFR_COLORS[assessment.currentLevel],
                }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* All Levels Overview */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">All Levels Overview</h2>
        <div className="grid grid-cols-7 gap-2">
          {assessment.levelDetails.map((level) => (
            <LevelCard
              key={level.level}
              level={level}
              isCurrent={level.level === assessment.currentLevel}
            />
          ))}
        </div>
      </div>

      {/* Progress Over Time */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Progress Over Time</h2>
          <select
            value={progressionDays}
            onChange={(e) => setProgressionDays(Number(e.target.value) as 30 | 60 | 90)}
            className="input text-sm py-2"
          >
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </div>
        {progression && progression.progression.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={progression.progression}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: string) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
              <Tooltip
                labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
                formatter={(value, name) => [
                  `${String(value)}%`,
                  name === 'overallPercentage'
                    ? 'Overall'
                    : name === 'vocabularyPercentage'
                      ? 'Vocabulary'
                      : 'Grammar',
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'overallPercentage'
                    ? 'Overall'
                    : value === 'vocabularyPercentage'
                      ? 'Vocabulary'
                      : 'Grammar'
                }
              />
              <Line
                type="monotone"
                dataKey="overallPercentage"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="vocabularyPercentage"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="grammarPercentage"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No progression data available yet. Keep learning to track your progress!
          </div>
        )}
      </div>

      {/* Level Breakdown Chart */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Level Breakdown</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={assessment.levelDetails}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="level" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
            <Tooltip formatter={(value) => [`${String(value)}%`, 'Progress']} />
            <Bar dataKey="overallPercentage" fill="#3b82f6">
              {assessment.levelDetails.map((entry) => (
                <Cell key={`cell-${entry.level}`} fill={CEFR_COLORS[entry.level]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Requirements for Next Level */}
      {requirements && !requirementsLoading && !requirementsError && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Requirements for {requirements.level}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Vocabulary Needed</p>
              <p className="text-2xl font-bold text-primary-600">{requirements.vocabularyNeeded}</p>
              <p className="text-xs text-gray-500">words to master</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Grammar Needed</p>
              <p className="text-2xl font-bold text-amber-600">{requirements.grammarNeeded}</p>
              <p className="text-xs text-gray-500">concepts to complete</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Est. Practice Time</p>
              <p className="text-2xl font-bold text-gray-900">
                {requirements.estimatedPracticeHours}h
              </p>
              <p className="text-xs text-gray-500">to reach goal</p>
            </div>
          </div>

          {/* Gap Lists */}
          {(requirements.vocabularyGap.length > 0 || requirements.grammarGap.length > 0) && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {requirements.vocabularyGap.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Vocabulary to Learn ({requirements.vocabularyGap.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {requirements.vocabularyGap.slice(0, 10).map((word, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-primary-100 text-primary-800 text-xs rounded"
                      >
                        {word}
                      </span>
                    ))}
                    {requirements.vocabularyGap.length > 10 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        +{requirements.vocabularyGap.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              {requirements.grammarGap.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Grammar to Complete ({requirements.grammarGap.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {requirements.grammarGap.slice(0, 10).map((rule, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded"
                      >
                        {rule}
                      </span>
                    ))}
                    {requirements.grammarGap.length > 10 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        +{requirements.grammarGap.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assessment Timestamp */}
      <div className="text-center text-sm text-gray-500">
        Last assessed: {new Date(assessment.assessedAt).toLocaleString()}
      </div>
    </div>
  );
}

// Level Card Component
function LevelCard({ level, isCurrent }: { level: CEFRLevelData; isCurrent: boolean }) {
  return (
    <div
      className={`p-3 rounded-lg text-center transition-all ${
        isCurrent
          ? 'ring-2 ring-primary-500 bg-primary-50'
          : level.isCompleted
            ? 'bg-green-50 border border-green-200'
            : 'bg-gray-50 border border-gray-200'
      }`}
    >
      <p className="text-lg font-bold" style={{ color: CEFR_COLORS[level.level] }}>
        {level.level}
      </p>
      <p className="text-xl font-bold text-gray-900 mt-1">{level.overallPercentage}%</p>
      <div className="mt-2 flex items-center justify-center">
        {level.isCompleted ? (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ) : isCurrent ? (
          <ArrowRight className="w-5 h-5 text-primary-600" />
        ) : (
          <div className="w-5 h-5"></div>
        )}
      </div>
    </div>
  );
}
