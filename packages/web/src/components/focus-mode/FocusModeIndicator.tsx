import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

interface FocusModeSettings {
  enabled: boolean;
  focusLanguage: string | null;
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

export function FocusModeIndicator() {
  const { data: settings } = useQuery<FocusModeSettings>({
    queryKey: ['focus-mode-settings'],
    queryFn: () => api.get('/learning/focus/settings'),
    staleTime: 30000, // Cache for 30 seconds
  });

  if (!settings?.enabled || !settings.focusLanguage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
      <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
      <span>Focus: {LANGUAGE_NAMES[settings.focusLanguage] || settings.focusLanguage}</span>
    </div>
  );
}
