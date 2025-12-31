// API response types
export interface User {
  id: string;
  email: string;
  role: 'learner' | 'operator';
  createdAt: string;
}

export interface Language {
  id: string;
  name: string;
  nativeName: string;
  isoCode: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  requestId: string;
}

export interface UserPreferences {
  baseLanguage: string;
  studiedLanguages: string[];
  focusModeEnabled: boolean;
  focusLanguage: string | null;
  onboardingCompleted: boolean;
  settings: Record<string, unknown>;
}

// Common UI types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
