import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

interface GrammarExample {
  sentence: string;
  translation: string;
  highlighted?: string;
}

interface ConjugationTable {
  tableType: string;
  headers: string[];
  rows: { label: string; cells: string[] }[];
}

interface LanguageGrammarData {
  language: string;
  ruleId: string;
  ruleName: string;
  explanation: string;
  examples: GrammarExample[];
  conjugationTable?: ConjugationTable;
  level: string;
  category: string;
}

interface ComparisonDifference {
  aspect: string;
  descriptions: { language: string; description: string }[];
}

interface GrammarComparison {
  conceptKey: string;
  conceptName: string;
  languages: LanguageGrammarData[];
  similarities: string[];
  differences: ComparisonDifference[];
  crossLinguisticInsights: string[];
}

interface AvailableConcept {
  conceptKey: string;
  conceptName: string;
  languageCount: number;
}

interface ConceptsResponse {
  concepts: AvailableConcept[];
}

interface ComparisonResponse {
  comparison: GrammarComparison;
}

interface ComparativeGrammarProps {
  availableLanguages: string[];
}

const LANGUAGE_NAMES: Record<string, string> = {
  EN: 'English',
  RU: 'Russian',
  DE: 'German',
  FR: 'French',
  ES: 'Spanish',
  IT: 'Italian',
  PT: 'Portuguese',
  ZH: 'Chinese',
  JA: 'Japanese',
  AR: 'Arabic',
  SL: 'Slovenian',
};

export function ComparativeGrammar({ availableLanguages }: ComparativeGrammarProps) {
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<string>('');

  const scrollRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Fetch available concepts for comparison
  const { data: conceptsData, isLoading: conceptsLoading } = useQuery<ConceptsResponse>({
    queryKey: ['comparative-concepts', selectedLanguages],
    queryFn: async () => {
      const languagesParam = selectedLanguages.join(',');
      return api.get<ConceptsResponse>(`/comparative/grammar/concepts?languages=${languagesParam}`);
    },
    enabled: selectedLanguages.length >= 2,
  });

  // Fetch detailed comparison
  const { data: comparisonData, isLoading: comparisonLoading } = useQuery<ComparisonResponse>({
    queryKey: ['comparative-grammar', selectedConcept, selectedLanguages],
    queryFn: async () => {
      const languagesParam = selectedLanguages.join(',');
      return api.get<ComparisonResponse>(
        `/comparative/grammar/compare?conceptKey=${selectedConcept}&languages=${languagesParam}`
      );
    },
    enabled: !!selectedConcept && selectedLanguages.length >= 2,
  });

  const comparison = comparisonData?.comparison || null;

  const handleLanguageToggle = (language: string) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(language)) {
        return prev.filter((l) => l !== language);
      } else if (prev.length < 3) {
        return [...prev, language];
      }
      return prev;
    });
    setSelectedConcept('');
  };

  // Synchronized scrolling
  const handleScroll = (sourceLanguage: string) => {
    const sourceRef = scrollRefs.current[sourceLanguage];
    if (!sourceRef) return;

    const scrollPercentage =
      sourceRef.scrollTop / (sourceRef.scrollHeight - sourceRef.clientHeight);

    Object.keys(scrollRefs.current).forEach((lang) => {
      if (lang !== sourceLanguage && scrollRefs.current[lang]) {
        const targetRef = scrollRefs.current[lang];
        targetRef.scrollTop = scrollPercentage * (targetRef.scrollHeight - targetRef.clientHeight);
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="card p-6">
        <h2 className="text-2xl font-bold mb-2">Comparative Grammar</h2>
        <p className="text-gray-600">
          Compare grammar concepts across languages you're studying to identify patterns and avoid
          interference.
        </p>
      </div>

      {/* Language Selector */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Select Languages to Compare (2-3)</h3>
        <div className="flex flex-wrap gap-3">
          {availableLanguages.map((language) => {
            const isSelected = selectedLanguages.includes(language);
            const isDisabled = !isSelected && selectedLanguages.length >= 3;

            return (
              <button
                key={language}
                onClick={() => handleLanguageToggle(language)}
                disabled={isDisabled}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isDisabled
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {LANGUAGE_NAMES[language] || language}
                {isSelected && ' \u2713'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Concept Selector */}
      {selectedLanguages.length >= 2 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Select Grammar Concept</h3>
          {conceptsLoading ? (
            <div className="text-gray-600">Loading concepts...</div>
          ) : conceptsData && conceptsData.concepts.length > 0 ? (
            <select
              value={selectedConcept}
              onChange={(e) => setSelectedConcept(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Choose a concept --</option>
              {conceptsData.concepts.map((concept) => (
                <option key={concept.conceptKey} value={concept.conceptKey}>
                  {concept.conceptName} ({concept.languageCount} languages)
                </option>
              ))}
            </select>
          ) : (
            <div className="text-gray-600">
              No comparable grammar concepts found for these languages yet.
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {comparisonLoading && (
        <div className="card p-12 text-center text-gray-600">Loading comparison...</div>
      )}

      {/* Comparison Display */}
      {comparison && (
        <div className="space-y-6">
          {/* Similarities */}
          {comparison.similarities.length > 0 && (
            <div className="bg-green-50 border-l-4 border-green-400 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-green-900 mb-3">Similarities</h3>
              <ul className="space-y-2">
                {comparison.similarities.map((similarity, idx) => (
                  <li key={idx} className="text-green-800">
                    {similarity}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Differences */}
          {comparison.differences.length > 0 && (
            <div className="bg-orange-50 border-l-4 border-orange-400 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-orange-900 mb-3">Differences</h3>
              <div className="space-y-4">
                {comparison.differences.map((diff, idx) => (
                  <div key={idx}>
                    <div className="font-semibold text-orange-900 mb-2">{diff.aspect}:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {diff.descriptions.map((desc, descIdx) => (
                        <div
                          key={descIdx}
                          className="bg-white p-3 rounded border border-orange-200"
                        >
                          <div className="font-medium text-gray-900 mb-1">
                            {LANGUAGE_NAMES[desc.language] || desc.language}
                          </div>
                          <div className="text-sm text-gray-700">{desc.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-Linguistic Insights */}
          {comparison.crossLinguisticInsights.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">Learning Insights</h3>
              <div className="space-y-2">
                {comparison.crossLinguisticInsights.map((insight, idx) => (
                  <div key={idx} className="text-blue-800">
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Side-by-Side Grammar Details */}
          <div className="card p-6">
            <h3 className="text-xl font-bold mb-6">
              {comparison.conceptName} - Detailed Comparison
            </h3>

            <div
              className={`grid gap-6 ${
                comparison.languages.length === 2 ? 'md:grid-cols-2' : 'lg:grid-cols-3'
              }`}
            >
              {comparison.languages.map((langData) => (
                <div
                  key={langData.language}
                  className="border-2 border-gray-200 rounded-lg p-4 space-y-4"
                >
                  {/* Language Header */}
                  <div className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-center">
                    {LANGUAGE_NAMES[langData.language] || langData.language}
                    <span className="ml-2 text-sm opacity-75">({langData.level})</span>
                  </div>

                  {/* Scrollable Content */}
                  <div
                    ref={(el) => (scrollRefs.current[langData.language] = el)}
                    onScroll={() => handleScroll(langData.language)}
                    className="overflow-y-auto space-y-4"
                    style={{ maxHeight: '500px' }}
                  >
                    {/* Rule Name */}
                    <h4 className="font-semibold text-lg">{langData.ruleName}</h4>

                    {/* Explanation */}
                    <div className="text-gray-700">{langData.explanation}</div>

                    {/* Conjugation Table */}
                    {langData.conjugationTable && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border border-gray-300 text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="border border-gray-300 px-2 py-1"></th>
                              {langData.conjugationTable.headers.map((header, hIdx) => (
                                <th key={hIdx} className="border border-gray-300 px-2 py-1">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {langData.conjugationTable.rows.map((row, rIdx) => (
                              <tr key={rIdx}>
                                <td className="border border-gray-300 px-2 py-1 font-medium">
                                  {row.label}
                                </td>
                                {row.cells.map((cell, cIdx) => (
                                  <td key={cIdx} className="border border-gray-300 px-2 py-1">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Examples */}
                    {langData.examples.length > 0 && (
                      <div className="space-y-3">
                        <h5 className="font-semibold text-sm text-gray-600">Examples:</h5>
                        {langData.examples.map((example, exIdx) => (
                          <div key={exIdx} className="bg-gray-50 p-3 rounded">
                            <div className="font-medium text-gray-900">{example.sentence}</div>
                            <div className="text-sm text-gray-600 mt-1">{example.translation}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state when no comparison */}
      {!comparison && !comparisonLoading && selectedLanguages.length >= 2 && selectedConcept && (
        <div className="card p-12 text-center text-gray-600">
          No comparison data available for this concept.
        </div>
      )}
    </div>
  );
}
