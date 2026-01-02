import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';

interface GrammarRule {
  ruleId: string;
  category: string;
  title: string;
  cefrLevel: string;
  explanation: string;
  language: string;
}

interface GrammarExample {
  text: string;
  translation?: string | null;
  annotation?: string | null;
}

interface RelatedRule {
  ruleId: string;
  title: string;
  relationshipType: 'prerequisite' | 'related';
}

interface GrammarLessonData {
  lesson: {
    rule: GrammarRule;
    examples: GrammarExample[];
    relatedRules: RelatedRule[];
    conjugationTable: null;
  };
}

interface ComparisonData {
  comparison: {
    category: string;
    languages: Array<{
      language: string;
      ruleId: string;
      title: string;
      explanation: string;
      example: string | null;
    }>;
    similarities: string[];
    differences: string[];
  } | null;
}

interface GrammarLessonProps {
  language: string;
}

export function GrammarLesson({ language }: GrammarLessonProps) {
  const { ruleId } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showComparison, setShowComparison] = useState(false);

  const { data, isLoading, error } = useQuery<GrammarLessonData>({
    queryKey: ['grammar-lesson', ruleId, language],
    queryFn: async () => {
      return api.get<GrammarLessonData>(`/learning/grammar/${ruleId}`);
    },
    enabled: !!ruleId,
  });

  const { data: comparisonData } = useQuery<ComparisonData>({
    queryKey: ['grammar-comparison', ruleId],
    queryFn: async () => {
      return api.get<ComparisonData>(`/learning/grammar/${ruleId}/comparison`);
    },
    enabled: !!ruleId && showComparison,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/learning/grammar/${ruleId}/complete`, { language });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grammar-next'] });
      void queryClient.invalidateQueries({ queryKey: ['curriculum-stats'] });
      void navigate(`/learn/${language}/grammar`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading grammar lesson...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card p-8 text-center max-w-md">
          <h3 className="text-xl font-bold text-red-600 mb-2">Lesson Not Found</h3>
          <p className="text-gray-600 mb-4">The requested grammar lesson could not be found.</p>
          <button
            onClick={() => {
              void navigate(`/learn/${language}/grammar`);
            }}
            className="btn btn-primary"
          >
            Back to Grammar Lessons
          </button>
        </div>
      </div>
    );
  }

  const { rule, examples, relatedRules } = data.lesson;
  const comparison = comparisonData?.comparison;

  return (
    <div className="grammar-lesson max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="card p-8 mb-6">
        <h1 className="text-4xl font-bold mb-4">{rule.title}</h1>

        <div className="flex gap-3 items-center flex-wrap mb-4">
          <span className="badge badge-lg bg-blue-500 text-white">{rule.cefrLevel}</span>
          <span className="badge badge-lg bg-gray-200 text-gray-700">{rule.category}</span>
        </div>

        {comparison && (
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="btn btn-secondary btn-sm"
          >
            {showComparison ? 'Hide' : 'Show'} Cross-Language Comparison
          </button>
        )}
      </div>

      {/* Cross-Linguistic Comparison */}
      {showComparison && comparison && (
        <div className="card p-6 mb-6 bg-blue-50 border-2 border-blue-200">
          <h2 className="text-2xl font-bold mb-4">Comparison Across Languages</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {comparison.languages.map((lang) => (
              <div key={lang.language} className="card p-4 bg-white">
                <h3 className="font-bold text-lg mb-2">{lang.language}</h3>
                <p className="text-sm text-gray-700 mb-2">{lang.title}</p>
                {lang.example && <p className="text-sm italic text-gray-600">"{lang.example}"</p>}
              </div>
            ))}
          </div>

          {comparison.similarities.length > 0 && (
            <div className="mb-4">
              <h3 className="font-bold mb-2 text-green-700">✓ Similarities:</h3>
              <ul className="list-disc list-inside space-y-1">
                {comparison.similarities.map((sim, idx) => (
                  <li key={idx} className="text-gray-700">
                    {sim}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {comparison.differences.length > 0 && (
            <div>
              <h3 className="font-bold mb-2 text-orange-700">⚠ Differences:</h3>
              <ul className="list-disc list-inside space-y-1">
                {comparison.differences.map((diff, idx) => (
                  <li key={idx} className="text-gray-700">
                    {diff}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Explanation */}
      <div className="card p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">Explanation</h2>
        <div className="prose max-w-none">
          <p className="whitespace-pre-wrap text-gray-800 leading-relaxed">{rule.explanation}</p>
        </div>
      </div>

      {/* Examples */}
      <div className="card p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">Examples</h2>

        {examples.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No examples available for this lesson.</p>
        ) : (
          <div className="space-y-4">
            {examples.map((example, idx) => (
              <div key={idx} className="border-l-4 border-green-500 pl-4 py-2">
                <div className="flex items-start gap-3">
                  <span className="text-lg font-bold text-gray-400">{idx + 1}.</span>
                  <div className="flex-1">
                    <p className="text-lg font-medium mb-1">{example.text}</p>
                    {example.translation && (
                      <p className="text-gray-600 italic mb-1">{example.translation}</p>
                    )}
                    {example.annotation && (
                      <p className="text-sm text-green-700 bg-green-50 p-2 rounded mt-2">
                        💡 {example.annotation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Related Rules */}
      {relatedRules.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">Related Topics</h2>

          <div className="space-y-2">
            {relatedRules.map((related) => (
              <div
                key={related.ruleId}
                onClick={() => {
                  void navigate(`/learn/${language}/grammar/${related.ruleId}`);
                }}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded cursor-pointer transition-colors"
              >
                <span
                  className={`badge badge-sm ${
                    related.relationshipType === 'prerequisite'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {related.relationshipType}
                </span>
                <span className="text-lg">{related.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => {
            void navigate(-1);
          }}
          className="btn btn-secondary"
        >
          ← Previous
        </button>
        <button
          onClick={() => completeMutation.mutate()}
          className="btn btn-primary"
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? 'Completing...' : 'Complete Lesson →'}
        </button>
      </div>
    </div>
  );
}
