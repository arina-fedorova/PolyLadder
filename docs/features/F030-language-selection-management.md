# F030: Language Selection & Management

**Feature Code**: F030
**Created**: 2025-12-17
**Phase**: 8 - Learning Foundation
**Status**: Completed
**Completed**: 2025-12-31

---

## Description

After completing onboarding, learners need the ability to manage their studied languages and focus mode preferences. This feature provides a settings interface where users can add new languages (up to 5 total), remove languages (while preserving progress data), enable/disable focus mode, and switch the focused language. Changes are immediately reflected across all learning interfaces.

## Success Criteria

- [x] Settings page displays current studied languages with add/remove controls
- [x] Add language button (maximum 5 languages total)
- [x] Remove language button with confirmation dialog
- [x] Focus mode toggle with language selector dropdown
- [x] Changes immediately reflected in learning dashboard and navigation
- [x] Cannot remove all languages (minimum 1 required)
- [x] Progress data preserved when language removed (can be restored)
- [x] Orthography gates enforced when adding new language

---

## Tasks

### Task 1: Language Settings Page Component

**File**: `packages/web/src/pages/learner/LanguageSettingsPage.tsx`

Create settings interface for managing studied languages and focus mode.

**Implementation Plan**:

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface UserPreferences {
  studiedLanguages: string[];
  focusModeEnabled: boolean;
  focusLanguage: string | null;
  maxLanguages: number;
}

interface AddLanguageModalProps {
  currentLanguages: string[];
  onAdd: (language: string) => void;
  onClose: () => void;
}

const AVAILABLE_LANGUAGES = {
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese (Mandarin)',
  'ar': 'Arabic',
};

function AddLanguageModal({ currentLanguages, onAdd, onClose }: AddLanguageModalProps) {
  const [selectedLanguage, setSelectedLanguage] = useState('');

  const availableLanguages = Object.entries(AVAILABLE_LANGUAGES).filter(
    ([code]) => !currentLanguages.includes(code)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Add New Language</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="input w-full"
            >
              <option value="">Choose a language...</option>
              {availableLanguages.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              You'll need to complete the orthography gate (CEFR A0) for this language before
              accessing other content.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => selectedLanguage && onAdd(selectedLanguage)}
              disabled={!selectedLanguage}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              Add Language
            </button>
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LanguageSettingsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch user preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const response = await apiClient.get<UserPreferences>('/user/preferences');
      return response.data;
    },
  });

  // Add language mutation
  const addLanguageMutation = useMutation({
    mutationFn: async (language: string) => {
      await apiClient.post('/user/preferences/languages', { language });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['user-preferences']);
      setShowAddModal(false);
    },
  });

  // Remove language mutation
  const removeLanguageMutation = useMutation({
    mutationFn: async (language: string) => {
      await apiClient.delete(`/user/preferences/languages/${language}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['user-preferences']);
    },
  });

  // Update focus mode mutation
  const updateFocusMutation = useMutation({
    mutationFn: async (data: { enabled: boolean; language?: string }) => {
      await apiClient.post('/user/preferences/focus', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['user-preferences']);
    },
  });

  const handleAddLanguage = (language: string) => {
    addLanguageMutation.mutate(language);
  };

  const handleRemoveLanguage = (language: string) => {
    if (preferences!.studiedLanguages.length === 1) {
      alert('You must study at least one language.');
      return;
    }

    const languageName = AVAILABLE_LANGUAGES[language as keyof typeof AVAILABLE_LANGUAGES];
    if (window.confirm(
      `Remove ${languageName}?\n\nYour progress will be hidden but not deleted. You can restore it by re-adding this language.`
    )) {
      removeLanguageMutation.mutate(language);
    }
  };

  const handleToggleFocus = (enabled: boolean) => {
    if (!enabled) {
      updateFocusMutation.mutate({ enabled: false });
    } else if (preferences) {
      // Default to first language when enabling
      updateFocusMutation.mutate({
        enabled: true,
        language: preferences.studiedLanguages[0],
      });
    }
  };

  const handleChangeFocusLanguage = (language: string) => {
    updateFocusMutation.mutate({ enabled: true, language });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!preferences) {
    return <div className="p-6">Failed to load preferences</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Language Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your studied languages and focus mode preferences
        </p>
      </div>

      {/* Studied Languages Section */}
      <section className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Studied Languages ({preferences.studiedLanguages.length}/{preferences.maxLanguages})
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Languages you're currently learning. You can study up to {preferences.maxLanguages} languages simultaneously.
            </p>
          </div>
          {preferences.studiedLanguages.length < preferences.maxLanguages && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Language
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {preferences.studiedLanguages.map((lang) => (
            <div
              key={lang}
              className="card border-2 border-gray-200 hover:border-blue-300 p-4 flex items-center justify-between"
            >
              <div>
                <h3 className="font-semibold text-gray-900">
                  {AVAILABLE_LANGUAGES[lang as keyof typeof AVAILABLE_LANGUAGES]}
                </h3>
                <p className="text-sm text-gray-500">Language code: {lang}</p>
              </div>
              <button
                onClick={() => handleRemoveLanguage(lang)}
                disabled={preferences.studiedLanguages.length === 1}
                className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {preferences.studiedLanguages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No languages added yet. Click "Add Language" to get started.
          </div>
        )}
      </section>

      {/* Focus Mode Section */}
      <section className="card p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Focus Mode</h2>
          <p className="text-sm text-gray-600 mt-1">
            Focus on a single language to reduce cognitive load and improve retention.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.focusModeEnabled}
              onChange={(e) => handleToggleFocus(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-gray-900">Enable focus mode</span>
          </label>
        </div>

        {preferences.focusModeEnabled && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Focused Language
            </label>
            <select
              value={preferences.focusLanguage || ''}
              onChange={(e) => handleChangeFocusLanguage(e.target.value)}
              className="input w-full max-w-md"
            >
              {preferences.studiedLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {AVAILABLE_LANGUAGES[lang as keyof typeof AVAILABLE_LANGUAGES]}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-600">
              Only content from {AVAILABLE_LANGUAGES[(preferences.focusLanguage || preferences.studiedLanguages[0]) as keyof typeof AVAILABLE_LANGUAGES]} will be shown in your learning sessions.
            </p>
          </div>
        )}

        {!preferences.focusModeEnabled && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              Focus mode is disabled. You'll see content from all studied languages.
            </p>
          </div>
        )}
      </section>

      {/* Add Language Modal */}
      {showAddModal && (
        <AddLanguageModal
          currentLanguages={preferences.studiedLanguages}
          onAdd={handleAddLanguage}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
```

**Dependencies**: TanStack Query, API client (F018), Auth context (F023)

---

### Task 2: API Endpoints for Language Management

**File**: `packages/api/src/routes/user/preferences.ts`

Create endpoints for managing user language preferences.

**Implementation Plan**:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const AddLanguageSchema = z.object({
  language: z.string().min(2).max(3),
});

const UpdateFocusSchema = z.object({
  enabled: z.boolean(),
  language: z.string().optional(),
});

export default async function preferencesRoutes(fastify: FastifyInstance) {
  // GET /user/preferences - Get user preferences
  fastify.get('/user/preferences', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;

      const result = await fastify.pg.query(
        `SELECT
          studied_languages,
          focus_mode_enabled,
          focus_language
        FROM user_preferences
        WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Preferences not found' });
      }

      const prefs = result.rows[0];

      return reply.code(200).send({
        studiedLanguages: prefs.studied_languages || [],
        focusModeEnabled: prefs.focus_mode_enabled || false,
        focusLanguage: prefs.focus_language,
        maxLanguages: 5,
      });
    },
  });

  // POST /user/preferences/languages - Add language
  fastify.post('/user/preferences/languages', {
    onRequest: [fastify.authenticate],
    schema: {
      body: AddLanguageSchema,
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { language } = request.body as z.infer<typeof AddLanguageSchema>;

      // Check current language count
      const prefsResult = await fastify.pg.query(
        `SELECT studied_languages FROM user_preferences WHERE user_id = $1`,
        [userId]
      );

      if (prefsResult.rows.length === 0) {
        return reply.code(404).send({ error: 'User preferences not found' });
      }

      const currentLanguages = prefsResult.rows[0].studied_languages || [];

      if (currentLanguages.length >= 5) {
        return reply.code(400).send({ error: 'Maximum 5 languages allowed' });
      }

      if (currentLanguages.includes(language)) {
        return reply.code(400).send({ error: 'Language already added' });
      }

      // Add language
      await fastify.pg.query(
        `UPDATE user_preferences
         SET studied_languages = array_append(studied_languages, $1),
             updated_at = NOW()
         WHERE user_id = $2`,
        [language, userId]
      );

      // Create orthography gate requirement for new language
      await fastify.pg.query(
        `INSERT INTO user_orthography_gates (user_id, language, status)
         VALUES ($1, $2, 'locked')
         ON CONFLICT (user_id, language) DO NOTHING`,
        [userId, language]
      );

      return reply.code(200).send({ success: true });
    },
  });

  // DELETE /user/preferences/languages/:language - Remove language
  fastify.delete('/user/preferences/languages/:language', {
    onRequest: [fastify.authenticate],
    schema: {
      params: z.object({
        language: z.string(),
      }),
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { language } = request.params as { language: string };

      // Check current language count
      const prefsResult = await fastify.pg.query(
        `SELECT studied_languages, focus_language FROM user_preferences WHERE user_id = $1`,
        [userId]
      );

      if (prefsResult.rows.length === 0) {
        return reply.code(404).send({ error: 'User preferences not found' });
      }

      const currentLanguages = prefsResult.rows[0].studied_languages || [];
      const focusLanguage = prefsResult.rows[0].focus_language;

      if (currentLanguages.length === 1) {
        return reply.code(400).send({ error: 'Cannot remove last language' });
      }

      // Remove language
      await fastify.pg.query(
        `UPDATE user_preferences
         SET studied_languages = array_remove(studied_languages, $1),
             focus_language = CASE
               WHEN focus_language = $1 THEN NULL
               ELSE focus_language
             END,
             updated_at = NOW()
         WHERE user_id = $2`,
        [language, userId]
      );

      // Note: We do NOT delete user progress data, just hide it
      // Progress can be restored by re-adding the language

      return reply.code(200).send({ success: true });
    },
  });

  // POST /user/preferences/focus - Update focus mode
  fastify.post('/user/preferences/focus', {
    onRequest: [fastify.authenticate],
    schema: {
      body: UpdateFocusSchema,
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { enabled, language } = request.body as z.infer<typeof UpdateFocusSchema>;

      if (enabled && !language) {
        return reply.code(400).send({ error: 'Language required when enabling focus mode' });
      }

      // Verify language is in studied languages if enabling
      if (enabled) {
        const prefsResult = await fastify.pg.query(
          `SELECT studied_languages FROM user_preferences WHERE user_id = $1`,
          [userId]
        );

        const studiedLanguages = prefsResult.rows[0]?.studied_languages || [];
        if (!studiedLanguages.includes(language)) {
          return reply.code(400).send({ error: 'Cannot focus on language you are not studying' });
        }
      }

      await fastify.pg.query(
        `UPDATE user_preferences
         SET focus_mode_enabled = $1,
             focus_language = $2,
             updated_at = NOW()
         WHERE user_id = $3`,
        [enabled, enabled ? language : null, userId]
      );

      return reply.code(200).send({ success: true });
    },
  });
}
```

**Dependencies**: Fastify, Zod, PostgreSQL plugin (F018), Auth middleware (F019)

---

### Task 3: Route Registration and Navigation Integration

**File**: `packages/web/src/App.tsx`

Add language settings route to application.

**Implementation Plan**:

```typescript
// Add import
import { LanguageSettingsPage } from './pages/learner/LanguageSettingsPage';

// In learner routes section
<Route
  path="/settings/languages"
  element={
    <ProtectedRoute requiredRole="learner">
      <LanguageSettingsPage />
    </ProtectedRoute>
  }
/>
```

**File**: `packages/web/src/components/layout/Header.tsx`

Add settings link to learner navigation.

**Implementation Plan**:

```typescript
// In learner navigation section
{user?.role === 'learner' && (
  <>
    <NavLink to="/learn">Learn</NavLink>
    <NavLink to="/review">Review</NavLink>
    <NavLink to="/progress">Progress</NavLink>
    <NavLink to="/settings/languages">Settings</NavLink>
  </>
)}
```

**File**: `packages/api/src/app.ts`

Register preferences routes plugin.

**Implementation Plan**:

```typescript
// Add import
import preferencesRoutes from './routes/user/preferences';

// Register route
await app.register(preferencesRoutes);
```

**Dependencies**: All previous tasks, routing setup (F024)

---

### Task 4: Database Migration for User Preferences Table

**File**: `packages/db/migrations/016-user-preferences.sql`

Create table to store user language preferences (if not already exists from F029).

**Implementation Plan**:

```sql
-- Create user_preferences table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  studied_languages TEXT[] NOT NULL DEFAULT '{}',
  focus_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  focus_language TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT max_languages CHECK (array_length(studied_languages, 1) <= 5),
  CONSTRAINT min_languages CHECK (
    array_length(studied_languages, 1) IS NULL OR
    array_length(studied_languages, 1) >= 0
  ),
  CONSTRAINT focus_language_in_studied CHECK (
    focus_language IS NULL OR
    focus_language = ANY(studied_languages)
  )
);

-- Create index on studied_languages for filtering
CREATE INDEX IF NOT EXISTS idx_user_preferences_languages
  ON user_preferences USING GIN (studied_languages);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_timestamp();

-- Create user_orthography_gates table to track orthography gate status per language
CREATE TABLE IF NOT EXISTS user_orthography_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('locked', 'unlocked', 'completed')),
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, language)
);

CREATE INDEX IF NOT EXISTS idx_user_orthography_gates_user
  ON user_orthography_gates(user_id);

CREATE INDEX IF NOT EXISTS idx_user_orthography_gates_status
  ON user_orthography_gates(status);
```

**Dependencies**: PostgreSQL database (F001)

---

## Open Questions

### Question 1: Language Limit Justification

**Context**: The current implementation limits users to 5 simultaneous languages. Is this the right limit?

**Options**:

1. **Keep 5-language limit** (current)
   - Pros: Prevents cognitive overload, encourages focus
   - Cons: Power users may want more
2. **Increase to 10 languages**
   - Pros: More flexibility for polyglots
   - Cons: May dilute learning effectiveness
3. **Make limit configurable** (per-user or premium feature)
   - Pros: Flexible, potential premium tier differentiator
   - Cons: More complex implementation

**Decision Needed**: Determine optimal language limit based on learning science and user research.

**Temporary Plan**: Keep 5-language limit for MVP. Can adjust based on user feedback.

---

### Question 2: Progress Data Retention on Language Removal

**Context**: When a user removes a language, should we keep their progress data or delete it?

**Options**:

1. **Keep progress hidden** (current approach)
   - Pros: Can restore by re-adding language, no data loss
   - Cons: Database bloat over time
2. **Soft delete with 30-day recovery window**
   - Pros: Balance between data retention and cleanup
   - Cons: More complex implementation, scheduled cleanup job needed
3. **Hard delete immediately** with confirmation
   - Pros: Clean database, clear user intent
   - Cons: Permanent data loss, no undo

**Decision Needed**: Choose data retention strategy based on user expectations and storage constraints.

**Temporary Plan**: Keep progress hidden (Option 1) for MVP. Add cleanup later if storage becomes an issue.

---

### Question 3: Focus Mode UX

**Context**: When focus mode is enabled, should non-focused languages still appear in navigation/settings?

**Options**:

1. **Hide non-focused languages completely**
   - Pros: True focus, less distraction
   - Cons: Hard to switch focus, confusing UX
2. **Show all languages but disable non-focused content**
   - Pros: Clear what's available, easy to switch
   - Cons: Visual clutter
3. **Collapsible section for non-focused languages** (current approach)
   - Pros: Balance between focus and accessibility
   - Cons: More UI complexity

**Decision Needed**: User testing to determine optimal focus mode UX.

**Temporary Plan**: Option 2 (show all, disable non-focused) for MVP. Iterate based on user feedback.

---

## Dependencies

**Blocks**:

- F033-F056: All learning features (require language selection)

**Depends on**:

- F005: Role-Based Authorization (learner role)
- F029: User Onboarding Flow (initial language selection)
- F018: API Infrastructure (API client)
- F023: Authentication UI (auth context)
- F024: Protected Routes & Navigation (routing)

**Optional**:

- Premium tier system (if language limit becomes a premium feature)

---

## Compatibility Analysis (2025-12-31)

### ✅ Existing Infrastructure - VERIFIED READY

**Database Schema** - All required tables exist:

- ✅ `user_preferences` table (migration 004) with:
  - `studied_languages` - jsonb array
  - `focus_mode_enabled` - boolean
  - `focus_language` - varchar(2)
  - `onboarding_completed` - boolean
  - `settings` - jsonb
- ⚠️ `user_orthography_gates` table - MISSING (need to create in migration)

**Existing API Endpoints** (`packages/api/src/routes/learning/preferences.ts`):

- ✅ `GET /learning/preferences` - Get user preferences
- ✅ `PUT /learning/preferences` - Update preferences (supports studied_languages update)
- ✅ `POST /learning/preferences/focus` - Toggle focus mode

### ❌ Missing Components - NEED TO CREATE

**API Endpoints** (add to `packages/api/src/routes/learning/preferences.ts`):

- ❌ `POST /learning/preferences/languages` - Add language to studied list
- ❌ `DELETE /learning/preferences/languages/:language` - Remove language from studied list

**Database Migration**:

- ❌ Create `user_orthography_gates` table for tracking orthography gate status per language

**Frontend Components**:

- ❌ `packages/web/src/pages/learner/LanguageSettingsPage.tsx` - Settings UI
- ❌ Route registration in App.tsx
- ❌ Navigation link in Header.tsx

### Implementation Notes

**API Path Consistency**: F030 document specifies `/user/preferences/languages` but F029 uses `/learning/preferences`. We will use `/learning/preferences/languages` for consistency with existing structure.

**Language Limits**:

- Maximum 5 languages (enforced in API)
- Minimum 1 language (cannot remove all)
- Progress data preserved when language removed

**Orthography Gates**:

- Each new language requires orthography gate (CEFR A0) completion
- Tracked in `user_orthography_gates` table
- Status: 'locked' (initial), 'unlocked', 'completed'

## Notes

### Implementation Priority

1. Create database migration for `user_orthography_gates` table (Task 4 partial)
2. Implement missing API endpoints - POST/DELETE languages (Task 2 partial)
3. Build language settings page UI (Task 1)
4. Integrate into routing and navigation (Task 3)

### Business Logic

- **Minimum Languages**: Users must study at least 1 language (cannot remove all)
- **Maximum Languages**: 5 languages maximum (prevent cognitive overload)
- **Orthography Gates**: Each new language requires orthography gate completion (CEFR A0) before accessing other content
- **Progress Preservation**: Removing a language hides progress but doesn't delete it (can be restored)
- **Focus Mode**: Optional feature to limit content to single language (reduces cognitive load)

### UX Considerations

- Clear confirmation dialogs when removing languages
- Visual indication of which language is focused (if focus mode enabled)
- Disable remove button when only 1 language remains
- Show progress restoration message when re-adding previously studied language
- Loading states while preferences update

### Performance Considerations

- Use GIN index on `studied_languages` array for fast lookups
- Cache user preferences in React Query (5-minute stale time)
- Optimistic updates for better UX when toggling focus mode

### Security Considerations

- Validate language codes against approved list on backend
- Prevent SQL injection with parameterized queries
- Enforce language limit server-side (don't trust client)
- Verify focus language is in studied languages before enabling
