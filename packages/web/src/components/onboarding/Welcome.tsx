import { useNavigate } from 'react-router-dom';

export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">Welcome to PolyLadder</h1>
          <p className="mt-4 text-lg text-gray-600">
            PolyLadder helps you learn multiple languages in parallel, building connections between
            them to accelerate your progress.
          </p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Features:</h2>
          <ul className="space-y-3">
            <li className="flex items-start">
              <span className="text-primary-600 font-bold mr-2">•</span>
              <span>Learn 2-5 languages simultaneously</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-600 font-bold mr-2">•</span>
              <span>Cross-linguistic comparisons</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-600 font-bold mr-2">•</span>
              <span>Spaced repetition system (SRS)</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary-600 font-bold mr-2">•</span>
              <span>Structured curriculum from A0 to C2</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => {
              void navigate('/onboarding/base-language');
            }}
            className="btn-primary flex-1"
          >
            Get Started
          </button>
          <button
            onClick={() => {
              void navigate('/onboarding/skip');
            }}
            className="btn-secondary flex-1"
          >
            Skip (use defaults)
          </button>
        </div>
      </div>
    </div>
  );
}
