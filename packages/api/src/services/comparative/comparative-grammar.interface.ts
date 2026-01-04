/**
 * Interface definitions for Comparative Grammar Service
 */

export interface GrammarExample {
  sentence: string;
  translation: string;
  highlighted?: string;
}

export interface ConjugationTable {
  tableType: string;
  headers: string[];
  rows: { label: string; cells: string[] }[];
}

export interface LanguageGrammarData {
  language: string;
  ruleId: string;
  ruleName: string;
  explanation: string;
  examples: GrammarExample[];
  conjugationTable?: ConjugationTable;
  level: string;
  category: string;
}

export interface ComparisonDifference {
  aspect: string;
  descriptions: { language: string; description: string }[];
}

export interface GrammarComparison {
  conceptKey: string;
  conceptName: string;
  languages: LanguageGrammarData[];
  similarities: string[];
  differences: ComparisonDifference[];
  crossLinguisticInsights: string[];
}

export interface AvailableConcept {
  conceptKey: string;
  conceptName: string;
  languageCount: number;
}

export interface ComparisonHistoryItem {
  conceptKey: string;
  conceptName: string;
  languages: string[];
  viewedAt: Date;
}
