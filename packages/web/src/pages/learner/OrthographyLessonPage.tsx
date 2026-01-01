import { useParams, useNavigate } from 'react-router-dom';
import { OrthographyLesson } from '@/components/learning/OrthographyLesson';

export function OrthographyLessonPage() {
  const { language } = useParams<{ language: string }>();
  const navigate = useNavigate();

  if (!language) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">No language specified</p>
          <button
            onClick={() => {
              void navigate('/dashboard');
            }}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleComplete = (): void => {
    // Navigate to exercises page after completing all lessons
    void navigate(`/learning/${language}/orthography/exercises`);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <OrthographyLesson
        language={language}
        onComplete={() => {
          handleComplete();
        }}
      />
    </div>
  );
}
