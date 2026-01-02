import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

interface GrammarLesson {
  ruleId: string;
  category: string;
  title: string;
  cefrLevel: string;
  explanation: string;
  language: string;
}

interface GrammarListData {
  lessons: GrammarLesson[];
}

interface GrammarListProps {
  language: string;
}

export function GrammarList({ language }: GrammarListProps) {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<GrammarListData>({
    queryKey: ['grammar-next', language],
    queryFn: async () => {
      return api.get<GrammarListData>(`/learning/grammar/next?language=${language}&limit=20`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading grammar lessons...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center bg-red-50">
        <h3 className="text-xl font-bold text-red-600 mb-2">Error Loading Grammar Lessons</h3>
        <p className="text-gray-600">Failed to load grammar lessons. Please try again later.</p>
      </div>
    );
  }

  if (!data?.lessons || data.lessons.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-xl font-bold text-gray-600 mb-2">No Grammar Lessons Available</h3>
        <p className="text-gray-500">
          You've completed all available grammar lessons for your current level. Complete more
          curriculum concepts to unlock new lessons.
        </p>
      </div>
    );
  }

  const handleLessonClick = (ruleId: string): void => {
    void navigate(`/learn/${language}/grammar/${ruleId}`);
  };

  // Group lessons by CEFR level
  const groupedLessons = data.lessons.reduce(
    (acc, lesson) => {
      const level = lesson.cefrLevel;
      if (!acc[level]) {
        acc[level] = [];
      }
      acc[level].push(lesson);
      return acc;
    },
    {} as Record<string, GrammarLesson[]>
  );

  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  return (
    <div className="grammar-list">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Grammar Lessons</h2>
        <p className="text-gray-600">
          {data.lessons.length} lesson{data.lessons.length !== 1 ? 's' : ''} available
        </p>
      </div>

      {levels.map((level) => {
        const lessonsForLevel = groupedLessons[level];
        if (!lessonsForLevel || lessonsForLevel.length === 0) return null;

        return (
          <div key={level} className="mb-8">
            <h3 className="text-xl font-bold mb-4">
              <span className="badge badge-lg bg-blue-500 text-white mr-2">{level}</span>
              Level {level}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lessonsForLevel.map((lesson) => (
                <div
                  key={lesson.ruleId}
                  onClick={() => handleLessonClick(lesson.ruleId)}
                  className="card p-4 cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200"
                >
                  <h4 className="text-lg font-bold mb-2">{lesson.title}</h4>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="badge badge-sm bg-gray-200 text-gray-700">
                      {lesson.category}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 line-clamp-2">{lesson.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
