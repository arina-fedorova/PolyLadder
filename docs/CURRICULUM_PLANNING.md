# Curriculum Planning & Content Sequencing

## Current State vs Desired State

### ❌ How It Works NOW (MVP - No Curriculum Logic)

```
Work Planner Gap Analysis:
┌─────────────────────────────────────────────────────────────┐
│ "Spanish A1 needs 100 meanings (has 0)"                     │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Claude API: "Generate Spanish A1 vocabulary word"           │
│ Result: Random words with no structure                      │
│  • perro (dog)                                              │
│  • abogado (lawyer) ← too advanced!                         │
│  • subjuntivo (subjunctive) ← A1 learner won't need this   │
│  • teclado (keyboard) ← random                              │
└─────────────────────────────────────────────────────────────┘

Problems:
• No thematic grouping (greetings, numbers, family...)
• No logical progression (basics → advanced)
• Wastes LLM API calls on irrelevant content
• Poor learning experience
```

### ✅ How It SHOULD Work (With F032 - Curriculum Graph)

```
┌───────────────────────────────────────────────────────────────────────┐
│                       CURRICULUM GRAPH                                │
│                   (Predefined Learning Path)                          │
└───────────────────────────────────────────────────────────────────────┘

SPANISH A0 (Complete Beginner):
┌──────────────────┐
│  1. ORTHOGRAPHY  │  Priority: CRITICAL
│  es_ortho_alphabet│  Prerequisites: none
│  • Letters A-Z   │
│  • Pronunciation │
└────────┬─────────┘
         │ BLOCKS ↓
         ▼
┌──────────────────┐
│  2. GREETINGS    │  Priority: HIGH
│  es_vocab_greet  │  Prerequisites: [orthography]
│  • hola          │
│  • buenos días   │
│  • adiós         │
└────────┬─────────┘
         │ BLOCKS ↓
         ▼
┌──────────────────┐
│  3. NUMBERS 0-10 │  Priority: HIGH
│  es_vocab_nums   │  Prerequisites: [orthography]
│  • uno, dos...   │
└────────┬─────────┘
         │
         ▼

SPANISH A1 (Elementary):
┌──────────────────┐
│  4. FAMILY       │  Prerequisites: [greetings, numbers]
│  es_vocab_family │
│  • madre, padre  │
│  • hermano       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  5. VERB SER     │  Prerequisites: [family]
│  es_grammar_ser  │  (I am, you are, he/she is)
│  • yo soy        │
│  • tú eres       │
└────────┬─────────┘
         │ BLOCKS ↓
         ▼
┌──────────────────┐
│  6. VERB ESTAR   │  Prerequisites: [ser]
│  es_grammar_estar│  (location, temporary state)
│  • estoy en casa │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  7. ADJECTIVES   │  Prerequisites: [ser, estar]
│  es_vocab_adj    │
│  • grande/pequeño│
│  • bueno/malo    │
└──────────────────┘
```

## Implementation: How Gap Analysis Uses Curriculum

### Current MVP Gap Analysis (Dumb):

```typescript
// packages/refinement-service/src/services/work-planner.service.ts
async findMeaningGaps(target: number): Promise<MeaningGap | null> {
  // Query: "How many Spanish A1 words exist?"
  const result = await pool.query(`
    SELECT language, level, COUNT(*)
    FROM approved_meanings
    WHERE language = 'ES' AND level = 'A1'
  `);

  // If count < 100, generate random word
  if (result.rows[0].count < 100) {
    return { language: 'ES', level: 'A1' }; // ❌ No topic info!
  }
}

// In LLM adapter:
buildPrompt(request) {
  return "Generate a Spanish A1 vocabulary word"; // ❌ Random!
}
```

### With Curriculum Graph (Smart):

```typescript
async findNextConcept(userId: string, language: string): Promise<Concept | null> {
  // 1. Get user's completed concepts
  const completed = await getCompletedConcepts(userId, language);

  // 2. Find concepts where prerequisites are met
  const unlocked = await pool.query(`
    SELECT cg.*
    FROM curriculum_graph cg
    LEFT JOIN user_concept_progress ucp
      ON cg.concept_id = ucp.concept_id
      AND ucp.user_id = $1
    WHERE cg.language = $2
      AND (ucp.status IS NULL OR ucp.status != 'completed')
      AND (
        -- All AND prerequisites completed
        cg.prerequisites_and <@ $3::text[]
        OR cg.prerequisites_and = '{}'
      )
      AND (
        -- At least one OR prerequisite completed (or none required)
        cg.prerequisites_or && $3::text[]
        OR cg.prerequisites_or = '{}'
      )
    ORDER BY cg.priority_order ASC
    LIMIT 1
  `, [userId, language, completed]);

  return unlocked.rows[0]; // ✅ Returns: "es_vocab_greetings" with topic!
}

// In LLM adapter:
buildPrompt(concept) {
  return `Generate vocabulary for topic: ${concept.topic}.
          Language: ${concept.language}
          Level: ${concept.level}

          Context: This is for complete beginners learning greetings.
          Choose words they'll use in first conversations.

          Examples: hola, adiós, buenos días, buenas noches

          Generate one similar word with definition and usage.`;
}
```

## Content Sequencing Rules

### Priority System:

```
Priority 1 (CRITICAL): Orthography
  → Can't learn language without knowing alphabet/sounds
  → Blocks everything else

Priority 2 (HIGH): Core Vocabulary
  → A0: greetings, numbers 0-20, yes/no, basic questions
  → A1: family, colors, food, animals, body parts
  → A2: weather, travel, hobbies, health

Priority 3 (MEDIUM): Essential Grammar
  → Present tense of most common verbs (ser, estar, tener, hacer)
  → Basic sentence structure
  → Question formation

Priority 4 (MEDIUM): Utterances
  → Example sentences using vocabulary
  → 3 sentences per meaning minimum

Priority 5 (LOW): Exercises
  → Practice exercises for each concept
  → Multiple choice, fill-in-blank, translation
```

### Grammar Sequencing Example:

```
Spanish Verbs - Proper Order:
┌─────────────────────────────────────────────────────────────┐
│ 1. ser (to be - identity)                                   │
│    "Yo soy estudiante" (I am a student)                     │
│    Prerequisites: none                                       │
└─────────────────────────────────────────────────────────────┘
                         ↓ REQUIRED FOR
┌─────────────────────────────────────────────────────────────┐
│ 2. estar (to be - location/state)                           │
│    "Estoy en casa" (I am at home)                           │
│    Prerequisites: [ser]                                      │
│    Reason: Must understand "to be" concept first            │
└─────────────────────────────────────────────────────────────┘
                         ↓ BOTH REQUIRED FOR
┌─────────────────────────────────────────────────────────────┐
│ 3. Adjectives                                               │
│    "Soy alto" vs "Estoy cansado"                            │
│    Prerequisites: [ser AND estar]                           │
│    Reason: Need to know which "to be" to use                │
└─────────────────────────────────────────────────────────────┘
                         ↓ FOUNDATION FOR
┌─────────────────────────────────────────────────────────────┐
│ 4. Regular -ar verbs (hablar, trabajar...)                  │
│    Prerequisites: [ser, estar, adjectives]                  │
│    Reason: Master "to be" before other verbs                │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Irregular verbs (ir, hacer, tener...)                    │
│    Prerequisites: [regular_ar_verbs]                        │
│    Reason: Learn patterns before exceptions                 │
└─────────────────────────────────────────────────────────────┘
```

## Temporary Workaround (Until F032)

### Add Topics to Work Planner Metadata:

```typescript
// packages/refinement-service/src/services/work-planner.service.ts

const CONTENT_SEQUENCE = {
  ES: {
    A0: [
      { topic: 'greetings', priority: 1, words: ['hola', 'adiós', 'buenos días'] },
      { topic: 'numbers_0_10', priority: 2, words: ['uno', 'dos', 'tres'] },
      { topic: 'yes_no', priority: 3, words: ['sí', 'no', 'por favor'] }
    ],
    A1: [
      { topic: 'family', priority: 1, words: ['madre', 'padre', 'hermano'] },
      { topic: 'colors', priority: 2, words: ['rojo', 'azul', 'verde'] },
      { topic: 'food', priority: 3, words: ['pan', 'agua', 'comida'] }
    ]
  },
  IT: {
    A0: [
      { topic: 'greetings', priority: 1, words: ['ciao', 'buongiorno'] },
      // ...
    ]
  }
};

async findMeaningGaps(target: number): Promise<MeaningGap | null> {
  // Find next incomplete topic
  const sequence = CONTENT_SEQUENCE[language][level];

  for (const topicDef of sequence) {
    const count = await countWordsInTopic(language, level, topicDef.topic);

    if (count < topicDef.words.length) {
      return {
        language,
        level,
        topic: topicDef.topic,              // ✅ Now has topic!
        currentCount: count,
        targetWords: topicDef.words,        // ✅ Specific words to generate
        metadata: { priority: topicDef.priority }
      };
    }
  }

  return null; // All topics complete
}
```

### Updated LLM Prompt:

```typescript
buildMeaningPrompt(request) {
  const { language, level, topic, targetWords } = request.metadata;

  return `You are generating vocabulary for language learners.

Language: ${language}
Level: ${level}
Topic: ${topic}

Generate ONE vocabulary word from this list: ${targetWords.join(', ')}

Choose a word that:
1. Belongs to the "${topic}" topic
2. Is appropriate for ${level} learners
3. Is commonly used in everyday conversation

Return JSON:
{
  "word": "chosen word",
  "definition": "English definition",
  "partOfSpeech": "noun/verb/adjective",
  "exampleSentence": "Example in ${language}",
  "exampleTranslation": "Example in English"
}`;
}
```

## Next Steps

1. **For MVP**: Add topic sequencing to Work Planner (temporary)
2. **Post-MVP**: Implement F032 Curriculum Graph
3. **Future**: AI-powered curriculum adaptation based on user performance

---

## Summary

**Current Problem:**

- System generates random content
- No learning progression
- Poor user experience

**Solution:**

- Define curriculum structure (topics, prerequisites)
- Work Planner follows curriculum order
- LLM generates content for specific topics

**Until Then:**

- Hardcode topic sequences in Work Planner
- Include topic in LLM prompts
- Generate structured, pedagogically sound content
