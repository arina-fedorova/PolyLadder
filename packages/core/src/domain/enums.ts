export enum Language {
  EN = 'EN',
  IT = 'IT',
  PT = 'PT',
  SL = 'SL',
  ES = 'ES',
}

export enum CEFRLevel {
  A0 = 'A0',
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
  C2 = 'C2',
}

export enum LifecycleState {
  DRAFT = 'DRAFT',
  CANDIDATE = 'CANDIDATE',
  VALIDATED = 'VALIDATED',
  APPROVED = 'APPROVED',
}

export enum UserRole {
  LEARNER = 'learner',
  OPERATOR = 'operator',
}

export enum VocabularyState {
  UNKNOWN = 'unknown',
  LEARNING = 'learning',
  KNOWN = 'known',
}

export enum ExerciseType {
  FLASHCARD = 'flashcard',
  MULTIPLE_CHOICE = 'multiple_choice',
  CLOZE = 'cloze',
  TRANSLATION = 'translation',
  DICTATION = 'dictation',
}

export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum SRSItemType {
  VOCABULARY = 'vocabulary',
  GRAMMAR = 'grammar',
  SENTENCE = 'sentence',
  EXERCISE = 'exercise',
}

export enum DataType {
  MEANING = 'meaning',
  UTTERANCE = 'utterance',
  RULE = 'rule',
  EXERCISE = 'exercise',
}

export enum ApprovalType {
  AUTOMATIC = 'AUTOMATIC',
  MANUAL = 'MANUAL',
}

export enum ConceptType {
  ORTHOGRAPHY = 'orthography',
  GRAMMAR = 'grammar',
  MEANING = 'meaning',
  EXERCISE_BUNDLE = 'exercise_bundle',
}
