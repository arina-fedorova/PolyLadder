# F029: User Onboarding Flow

**Feature Code**: F029
**Created**: 2025-12-17
**Phase**: 8 - Learning Foundation
**Status**: Completed

---

## Description

Implement first-time user onboarding flow that guides users through selecting their base language, choosing studied languages, and setting preferences. Ensures users understand the system before starting their learning journey.

## Success Criteria

- [x] Welcome screen explains PolyLadder's approach
- [x] Base language selection (cannot be changed later)
- [x] Studied languages selection (1-5 languages)
- [x] Optional focus mode explanation and setup
- [x] Onboarding completion persisted in user_preferences
- [x] Users can skip onboarding (defaults applied)
- [x] Returning users don't see onboarding again

---

## Tasks

### Task 0: Create User Preferences API Endpoints

**Description**: Create backend API endpoints for managing user preferences, required before frontend implementation.

**Implementation Plan**:

Create `packages/api/src/routes/learning/preferences.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { authMiddleware } from '../../middleware/auth';
import { ErrorResponseSchema } from '../../schemas/common';

const UserPreferencesSchema = Type.Object({
  baseLanguage: Type.String(),
  studiedLanguages: Type.Array(Type.String()),
  focusModeEnabled: Type.Boolean(),
  focusLanguage: Type.Union([Type.String(), Type.Null()]),
  onboardingCompleted: Type.Boolean(),
  settings: Type.Any(),
});

const UpdatePreferencesSchema = Type.Object({
  studiedLanguages: Type.Optional(Type.Array(Type.String())),
  focusModeEnabled: Type.Optional(Type.Boolean()),
  focusLanguage: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  onboardingCompleted: Type.Optional(Type.Boolean()),
  settings: Type.Optional(Type.Any()),
});

const FocusModeSchema = Type.Object({
  enabled: Type.Boolean(),
  language: Type.Optional(Type.String()),
});

// GET /preferences - Get user preferences
// PUT /preferences - Update user preferences
// POST /preferences/focus - Toggle focus mode
```

Update `packages/api/src/routes/learning/index.ts` to register preferences route.

Create tests in `packages/api/tests/routes/learning/preferences.test.ts`.

**Files Created**:

- `packages/api/src/routes/learning/preferences.ts`
- `packages/api/tests/routes/learning/preferences.test.ts`

**Files Modified**:

- `packages/api/src/routes/learning/index.ts`

---

### Task 1: Create Onboarding UI Components

**Description**: Build React components for onboarding screens.

**Implementation Plan**:

Create `packages/web/src/components/onboarding/Welcome.tsx`:

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';

export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="onboarding-screen">
      <h1>Welcome to PolyLadder</h1>
      <p>
        PolyLadder helps you learn multiple languages in parallel, building
        connections between them to accelerate your progress.
      </p>
      <h2>Key Features:</h2>
      <ul>
        <li>Learn 2-5 languages simultaneously</li>
        <li>Cross-linguistic comparisons</li>
        <li>Spaced repetition system (SRS)</li>
        <li>Structured curriculum from A0 to C2</li>
      </ul>
      <button onClick={() => navigate('/onboarding/base-language')}>
        Get Started
      </button>
      <button onClick={() => navigate('/onboarding/skip')}>
        Skip (use defaults)
      </button>
    </div>
  );
}
```

Create `packages/web/src/components/onboarding/BaseLanguageSelection.tsx`:

```typescript
import React, { useState } from 'react';
import { Language } from '@polyladder/core';
import { useNavigate } from 'react-router-dom';

const LANGUAGE_NAMES: Record<Language, string> = {
  [Language.EN]: 'English (US)',
  [Language.IT]: 'Italian',
  [Language.PT]: 'Portuguese (Portugal)',
  [Language.SL]: 'Slovenian',
  [Language.ES]: 'Spanish (Spain)',
};

export function BaseLanguageSelection() {
  const [selected, setSelected] = useState<Language | null>(null);
  const navigate = useNavigate();

  const handleContinue = () => {
    if (selected) {
      // Store in context/state
      navigate('/onboarding/studied-languages');
    }
  };

  return (
    <div className="onboarding-screen">
      <h1>Select Your Base Language</h1>
      <p>
        This is the language you already know well. It will be used for
        explanations and translations.
      </p>
      <p className="warning">
        ⚠️ This cannot be changed later.
      </p>

      <div className="language-grid">
        {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
          <button
            key={code}
            className={selected === code ? 'selected' : ''}
            onClick={() => setSelected(code as Language)}
          >
            {name}
          </button>
        ))}
      </div>

      <button onClick={handleContinue} disabled={!selected}>
        Continue
      </button>
    </div>
  );
}
```

Create `packages/web/src/components/onboarding/StudiedLanguagesSelection.tsx`:

```typescript
import React, { useState } from 'react';
import { Language } from '@polyladder/core';
import { useNavigate } from 'react-router-dom';

export function StudiedLanguagesSelection({ baseLanguage }: { baseLanguage: Language }) {
  const [selected, setSelected] = useState<Language[]>([]);
  const navigate = useNavigate();

  const toggleLanguage = (lang: Language) => {
    if (lang === baseLanguage) return; // Can't study base language

    if (selected.includes(lang)) {
      setSelected(selected.filter(l => l !== lang));
    } else if (selected.length < 5) {
      setSelected([...selected, lang]);
    }
  };

  const handleContinue = () => {
    if (selected.length > 0) {
      navigate('/onboarding/focus-mode');
    }
  };

  return (
    <div className="onboarding-screen">
      <h1>Which Languages Do You Want to Learn?</h1>
      <p>Select 1-5 languages. You can add more later.</p>

      <div className="language-grid">
        {Object.entries(LANGUAGE_NAMES).map(([code, name]) => {
          const lang = code as Language;
          const isBase = lang === baseLanguage;
          const isSelected = selected.includes(lang);
          const isDisabled = isBase || (selected.length >= 5 && !isSelected);

          return (
            <button
              key={code}
              className={isSelected ? 'selected' : ''}
              onClick={() => toggleLanguage(lang)}
              disabled={isDisabled}
            >
              {name}
              {isBase && ' (Base)'}
            </button>
          );
        })}
      </div>

      <p>{selected.length}/5 languages selected</p>

      <button onClick={handleContinue} disabled={selected.length === 0}>
        Continue
      </button>
    </div>
  );
}
```

**Files Created**:

- `packages/web/src/components/onboarding/Welcome.tsx`
- `packages/web/src/components/onboarding/BaseLanguageSelection.tsx`
- `packages/web/src/components/onboarding/StudiedLanguagesSelection.tsx`

---

### Task 2: Create Focus Mode Explanation Screen

**Description**: Explain focus mode and let users opt-in during onboarding.

**Implementation Plan**:

Create `packages/web/src/components/onboarding/FocusModeSetup.tsx`:

```typescript
import React, { useState } from 'react';
import { Language } from '@polyladder/core';
import { useNavigate } from 'react-router-dom';

export function FocusModeSetup({ studiedLanguages }: { studiedLanguages: Language[] }) {
  const [enabled, setEnabled] = useState(false);
  const [focusLanguage, setFocusLanguage] = useState<Language | null>(null);
  const navigate = useNavigate();

  const handleContinue = () => {
    // Save to API
    navigate('/onboarding/complete');
  };

  return (
    <div className="onboarding-screen">
      <h1>Focus Mode (Optional)</h1>
      <p>
        Focus mode temporarily narrows your learning to one language for
        intensive practice. You can switch or disable this anytime.
      </p>

      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable focus mode
      </label>

      {enabled && (
        <div>
          <p>Which language do you want to focus on?</p>
          <select
            value={focusLanguage || ''}
            onChange={(e) => setFocusLanguage(e.target.value as Language)}
          >
            <option value="">Select a language</option>
            {studiedLanguages.map(lang => (
              <option key={lang} value={lang}>
                {LANGUAGE_NAMES[lang]}
              </option>
            ))}
          </select>
        </div>
      )}

      <button onClick={handleContinue}>
        {enabled && focusLanguage ? 'Start Learning' : 'Skip Focus Mode'}
      </button>
    </div>
  );
}
```

**Files Created**: `packages/web/src/components/onboarding/FocusModeSetup.tsx`

---

### Task 3: Create Onboarding Completion Handler

**Description**: Save all onboarding choices to API and mark onboarding as complete.

**Implementation Plan**:

Create `packages/web/src/hooks/useOnboarding.ts`:

```typescript
import { useState } from 'react';
import { Language } from '@polyladder/core';
import { api } from '../services/api';

export function useOnboarding() {
  const [baseLanguage, setBaseLanguage] = useState<Language | null>(null);
  const [studiedLanguages, setStudiedLanguages] = useState<Language[]>([]);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [focusLanguage, setFocusLanguage] = useState<Language | null>(null);

  const completeOnboarding = async () => {
    // Update user preferences
    await api.put('/user/preferences', {
      studiedLanguages,
      focusModeEnabled,
      focusLanguage,
      onboardingCompleted: true,
    });

    // If focus mode enabled, set it
    if (focusModeEnabled && focusLanguage) {
      await api.post('/user/preferences/focus', {
        enabled: true,
        language: focusLanguage,
      });
    }

    // Add studied languages
    for (const lang of studiedLanguages) {
      await api.post('/user/preferences/languages', { language: lang });
    }
  };

  const skipOnboarding = async () => {
    // Just mark as completed with defaults
    await api.put('/user/preferences', {
      onboardingCompleted: true,
    });
  };

  return {
    baseLanguage,
    setBaseLanguage,
    studiedLanguages,
    setStudiedLanguages,
    focusModeEnabled,
    setFocusModeEnabled,
    focusLanguage,
    setFocusLanguage,
    completeOnboarding,
    skipOnboarding,
  };
}
```

**Files Created**: `packages/web/src/hooks/useOnboarding.ts`

---

### Task 4: Create Onboarding Router

**Description**: Set up routing for onboarding flow.

**Implementation Plan**:

Create `packages/web/src/pages/Onboarding.tsx`:

```typescript
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Welcome } from '../components/onboarding/Welcome';
import { BaseLanguageSelection } from '../components/onboarding/BaseLanguageSelection';
import { StudiedLanguagesSelection } from '../components/onboarding/StudiedLanguagesSelection';
import { FocusModeSetup } from '../components/onboarding/FocusModeSetup';
import { useOnboarding } from '../hooks/useOnboarding';

export function OnboardingPage() {
  const onboarding = useOnboarding();

  return (
    <div className="onboarding-container">
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route
          path="/base-language"
          element={<BaseLanguageSelection />}
        />
        <Route
          path="/studied-languages"
          element={
            onboarding.baseLanguage ? (
              <StudiedLanguagesSelection baseLanguage={onboarding.baseLanguage} />
            ) : (
              <Navigate to="/onboarding/base-language" replace />
            )
          }
        />
        <Route
          path="/focus-mode"
          element={
            onboarding.studiedLanguages.length > 0 ? (
              <FocusModeSetup studiedLanguages={onboarding.studiedLanguages} />
            ) : (
              <Navigate to="/onboarding/studied-languages" replace />
            )
          }
        />
        <Route path="/skip" element={<SkipOnboarding />} />
        <Route path="/complete" element={<OnboardingComplete />} />
      </Routes>
    </div>
  );
}
```

**Files Created**: `packages/web/src/pages/Onboarding.tsx`

---

### Task 5: Integrate Onboarding Check in App Router

**Description**: Redirect first-time users to onboarding flow.

**Implementation Plan**:

Update `packages/web/src/App.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { OnboardingPage } from './pages/Onboarding';
import { DashboardPage } from './pages/Dashboard';
import { useAuth } from './hooks/useAuth';
import { api } from './services/api';

export function App() {
  const { user, isAuthenticated } = useAuth();
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      // Check if onboarding completed
      api.get('/user/preferences').then(prefs => {
        setOnboardingCompleted(prefs.onboardingCompleted);
      });
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (onboardingCompleted === null) {
    return <div>Loading...</div>;
  }

  if (!onboardingCompleted) {
    return <OnboardingPage />;
  }

  return <DashboardPage />;
}
```

**Files Created**: None (update existing)

---

## Dependencies

- **Blocks**: F030-F056 (all learning features require onboarding)
- **Depends on**: F004 (auth), F005 (preferences), F022-F024 (React setup, routing)

---

## Notes

- Onboarding shown only once per user (unless manually reset)
- Base language cannot be changed after onboarding (no UI for this in MVP)
- Users can modify studied languages and focus mode after onboarding in settings
- Skip option applies sensible defaults (base language = EN, no studied languages)
- Onboarding completion tracked in `user_preferences.onboarding_completed` boolean

---

## Compatibility Analysis (Updated 2025-12-30)

### ✅ Existing Infrastructure - VERIFIED READY

**Database Schema** - All required tables/columns exist:

- ✅ `users.base_language` - varchar(2) with CHECK constraint (EN, IT, PT, SL, ES)
- ✅ `user_preferences.studied_languages` - jsonb array
- ✅ `user_preferences.focus_mode_enabled` - boolean (default: false)
- ✅ `user_preferences.focus_language` - varchar(2)
- ✅ `user_preferences.onboarding_completed` - boolean (default: false)
- ✅ `user_languages` - tracks learning progress per language

**Core Package (@polyladder/core)** - All enums defined:

- ✅ `Language` enum in `packages/core/src/domain/enums.ts` (EN, IT, PT, SL, ES)
- ✅ `CEFRLevel` enum (A0-C2)
- ✅ `UserRole` enum (learner, operator)

**Existing API Endpoints**:

- ✅ `POST /api/v1/learning/languages` - Add language
- ✅ `GET /api/v1/learning/languages` - Get user's languages with progress
- ✅ `DELETE /api/v1/learning/languages/:language` - Remove language

### ❌ Missing Components - NEED TO CREATE

**API Endpoints** (`packages/api/src/routes/learning/preferences.ts` - NEW):

- `GET /api/v1/learning/preferences` - Get user preferences
- `PUT /api/v1/learning/preferences` - Update preferences
- `POST /api/v1/learning/preferences/focus` - Toggle focus mode

**Frontend Components** (`packages/web/src/components/onboarding/` - NEW):

- All 4 onboarding components (Welcome, BaseLanguageSelection, StudiedLanguagesSelection, FocusModeSetup)
- `packages/web/src/hooks/useOnboarding.ts` - State management hook
- `packages/web/src/pages/learner/OnboardingPage.tsx` - Routing page

**App Integration**:

- Update `packages/web/src/App.tsx` to check `onboardingCompleted` for learners

### Consistency with Operator Flow

✅ **Language Support**: Same Language enum used in operator curriculum/mappings
✅ **Authentication**: Same authMiddleware and role-based access control
✅ **Database Schema**: No conflicts - operator tables (pipelines, drafts, etc.) are separate
✅ **API Structure**: Clear separation - `/operational/*` vs `/learning/*`

**Estimated Implementation Effort**: 1-2 days

**Migration Notes**: No database migrations required. All schema exists. Set `onboarding_completed = true` for existing operator users.
