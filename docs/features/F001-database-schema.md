# F001: Database Schema & Migrations

**Feature Code**: F001
**Created**: 2025-12-17
**Phase**: 0 - Foundation & Infrastructure
**Status**: Not Started

---

## Description

Design and implement the complete PostgreSQL database schema for PolyLadder. The schema must support multi-user authentication, shared knowledge base, user-specific progress tracking, and the data governance pipeline.

## Success Criteria

- [ ] PostgreSQL schema fully designed and documented
- [ ] Migration framework (node-pg-migrate) configured
- [ ] All tables created with proper indexes and constraints
- [ ] Development seed data available
- [ ] Connection pooling configured
- [ ] Schema validates against domain model

---

## Tasks

### Task 1: Install Database Dependencies

**Description**: Install PostgreSQL driver and migration tooling.

**Implementation Plan**:

1. Install dependencies in `@polyladder/db`:
   ```bash
   cd packages/db
   pnpm add pg
   pnpm add -D @types/pg node-pg-migrate
   ```

2. Update `packages/db/package.json` scripts:
   ```json
   {
     "scripts": {
       "migrate": "node-pg-migrate",
       "migrate:up": "node-pg-migrate up",
       "migrate:down": "node-pg-migrate down",
       "migrate:create": "node-pg-migrate create",
       "seed": "tsx src/seeds/index.ts"
     }
   }
   ```

3. Create migration config `.node-pg-migraterc`:
   ```json
   {
     "database-url-var": "DATABASE_URL",
     "dir": "src/migrations",
     "migrations-table": "pgmigrations",
     "schema": "public"
   }
   ```

**Files Created**:
- `packages/db/.node-pg-migraterc`

---

### Task 2: Design User & Authentication Tables

**Description**: Create tables for user accounts and authentication.

**Implementation Plan**:

1. Create migration `001_create_users_table.ts`:
   ```typescript
   import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

   export const shorthands: ColumnDefinitions | undefined = undefined;

   export async function up(pgm: MigrationBuilder): Promise<void> {
     pgm.createTable('users', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       email: {
         type: 'varchar(255)',
         notNull: true,
         unique: true
       },
       password_hash: {
         type: 'varchar(255)',
         notNull: true
       },
       role: {
         type: 'varchar(20)',
         notNull: true,
         check: "role IN ('learner', 'operator')"
       },
       base_language: {
         type: 'varchar(2)',
         notNull: true,
         check: "base_language IN ('EN', 'IT', 'PT', 'SL', 'ES')"
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       },
       updated_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Create indexes
     pgm.createIndex('users', 'email');
     pgm.createIndex('users', 'role');
   }

   export async function down(pgm: MigrationBuilder): Promise<void> {
     pgm.dropTable('users');
   }
   ```

**Files Created**:
- `packages/db/src/migrations/001_create_users_table.ts`

---

### Task 3: Design Approved Knowledge Base Tables

**Description**: Create tables for shared, approved linguistic data.

**Implementation Plan**:

1. Create migration `002_create_approved_tables.ts`:
   ```typescript
   export async function up(pgm: MigrationBuilder): Promise<void> {
     // Approved Meanings (language-independent semantic units)
     pgm.createTable('approved_meanings', {
       id: {
         type: 'varchar(100)',
         primaryKey: true
       },
       level: {
         type: 'varchar(2)',
         notNull: true,
         check: "level IN ('A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')"
       },
       tags: {
         type: 'jsonb',
         notNull: true,
         default: '[]'
       },
       russian_gloss: {
         type: 'text',
         notNull: false
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Approved Utterances (language-specific realizations)
     pgm.createTable('approved_utterances', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       meaning_id: {
         type: 'varchar(100)',
         notNull: true,
         references: 'approved_meanings(id)'
       },
       language: {
         type: 'varchar(2)',
         notNull: true,
         check: "language IN ('EN', 'IT', 'PT', 'SL', 'ES')"
       },
       text: {
         type: 'text',
         notNull: true
       },
       register: {
         type: 'varchar(20)',
         notNull: false
       },
       usage_notes: {
         type: 'text',
         notNull: false
       },
       audio_url: {
         type: 'varchar(500)',
         notNull: false
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Approved Grammar Rules
     pgm.createTable('approved_rules', {
       id: {
         type: 'varchar(100)',
         primaryKey: true
       },
       language: {
         type: 'varchar(2)',
         notNull: true,
         check: "language IN ('EN', 'IT', 'PT', 'SL', 'ES')"
       },
       level: {
         type: 'varchar(2)',
         notNull: true
       },
       category: {
         type: 'varchar(50)',
         notNull: true
       },
       title: {
         type: 'text',
         notNull: true
       },
       explanation: {
         type: 'text',
         notNull: true
       },
       examples: {
         type: 'jsonb',
         notNull: true,
         default: '[]'
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Approved Exercises
     pgm.createTable('approved_exercises', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       type: {
         type: 'varchar(20)',
         notNull: true,
         check: "type IN ('flashcard', 'multiple_choice', 'cloze', 'translation', 'dictation')"
       },
       level: {
         type: 'varchar(2)',
         notNull: true
       },
       languages: {
         type: 'jsonb',
         notNull: true,
         comment: 'Array of language codes involved'
       },
       prompt: {
         type: 'text',
         notNull: true
       },
       correct_answer: {
         type: 'text',
         notNull: true
       },
       options: {
         type: 'jsonb',
         notNull: false,
         comment: 'For multiple choice exercises'
       },
       metadata: {
         type: 'jsonb',
         notNull: true,
         default: '{}'
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Curriculum Graph
     pgm.createTable('curriculum_graph', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       concept_id: {
         type: 'varchar(100)',
         notNull: true,
         unique: true
       },
       concept_type: {
         type: 'varchar(20)',
         notNull: true,
         check: "concept_type IN ('orthography', 'grammar', 'meaning', 'exercise_bundle')"
       },
       language: {
         type: 'varchar(2)',
         notNull: false
       },
       prerequisites: {
         type: 'jsonb',
         notNull: true,
         default: '[]',
         comment: 'Array of prerequisite concept_ids'
       },
       metadata: {
         type: 'jsonb',
         notNull: true,
         default: '{}'
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Create indexes
     pgm.createIndex('approved_utterances', ['meaning_id']);
     pgm.createIndex('approved_utterances', ['language']);
     pgm.createIndex('approved_rules', ['language', 'level']);
     pgm.createIndex('approved_exercises', ['type', 'level']);
     pgm.createIndex('curriculum_graph', ['concept_id']);
   }

   export async function down(pgm: MigrationBuilder): Promise<void> {
     pgm.dropTable('curriculum_graph');
     pgm.dropTable('approved_exercises');
     pgm.dropTable('approved_rules');
     pgm.dropTable('approved_utterances');
     pgm.dropTable('approved_meanings');
   }
   ```

**Files Created**:
- `packages/db/src/migrations/002_create_approved_tables.ts`

---

### Task 4: Design Pipeline Tables

**Description**: Create tables for data lifecycle pipeline (DRAFT → CANDIDATE → VALIDATED → APPROVED).

**Implementation Plan**:

1. Create migration `003_create_pipeline_tables.ts`:
   ```typescript
   export async function up(pgm: MigrationBuilder): Promise<void> {
     // Drafts (raw data from any source)
     pgm.createTable('drafts', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       data_type: {
         type: 'varchar(20)',
         notNull: true,
         check: "data_type IN ('meaning', 'utterance', 'rule', 'exercise')"
       },
       raw_data: {
         type: 'jsonb',
         notNull: true
       },
       source: {
         type: 'varchar(100)',
         notNull: true,
         comment: 'Origin of data: llm, parser, manual, etc.'
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Candidates (normalized data)
     pgm.createTable('candidates', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       data_type: {
         type: 'varchar(20)',
         notNull: true
       },
       normalized_data: {
         type: 'jsonb',
         notNull: true
       },
       draft_id: {
         type: 'uuid',
         notNull: true,
         references: 'drafts(id)'
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Validated (passed quality gates)
     pgm.createTable('validated', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       data_type: {
         type: 'varchar(20)',
         notNull: true
       },
       validated_data: {
         type: 'jsonb',
         notNull: true
       },
       candidate_id: {
         type: 'uuid',
         notNull: true,
         references: 'candidates(id)'
       },
       validation_results: {
         type: 'jsonb',
         notNull: true,
         comment: 'Results from each quality gate'
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Validation Failures
     pgm.createTable('validation_failures', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       candidate_id: {
         type: 'uuid',
         notNull: true,
         references: 'candidates(id)'
       },
       gate_name: {
         type: 'varchar(100)',
         notNull: true
       },
       failure_reason: {
         type: 'text',
         notNull: true
       },
       failure_details: {
         type: 'jsonb',
         notNull: true,
         default: '{}'
       },
       retry_count: {
         type: 'integer',
         notNull: true,
         default: 0
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Approval Events (traceability)
     pgm.createTable('approval_events', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       validated_id: {
         type: 'uuid',
         notNull: true,
         references: 'validated(id)'
       },
       approved_table: {
         type: 'varchar(50)',
         notNull: true,
         comment: 'Target table: approved_meanings, approved_utterances, etc.'
       },
       approved_id: {
         type: 'varchar(100)',
         notNull: true,
         comment: 'ID in the approved table'
       },
       operator_id: {
         type: 'uuid',
         notNull: false,
         references: 'users(id)',
         comment: 'NULL if auto-approved'
       },
       approval_type: {
         type: 'varchar(20)',
         notNull: true,
         check: "approval_type IN ('automatic', 'manual')"
       },
       notes: {
         type: 'text',
         notNull: false
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Service State (for resumability)
     pgm.createTable('service_state', {
       id: {
         type: 'varchar(50)',
         primaryKey: true,
         comment: 'Service identifier'
       },
       state_data: {
         type: 'jsonb',
         notNull: true,
         default: '{}'
       },
       last_checkpoint: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       },
       updated_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Create indexes
     pgm.createIndex('drafts', 'data_type');
     pgm.createIndex('candidates', 'data_type');
     pgm.createIndex('validated', 'data_type');
     pgm.createIndex('validation_failures', 'candidate_id');
     pgm.createIndex('approval_events', ['approved_table', 'approved_id']);
   }

   export async function down(pgm: MigrationBuilder): Promise<void> {
     pgm.dropTable('service_state');
     pgm.dropTable('approval_events');
     pgm.dropTable('validation_failures');
     pgm.dropTable('validated');
     pgm.dropTable('candidates');
     pgm.dropTable('drafts');
   }
   ```

**Files Created**:
- `packages/db/src/migrations/003_create_pipeline_tables.ts`

---

### Task 5: Design User Progress Tables

**Description**: Create tables for user-specific learning progress and state.

**Implementation Plan**:

1. Create migration `004_create_user_progress_tables.ts`:
   ```typescript
   export async function up(pgm: MigrationBuilder): Promise<void> {
     // User Preferences
     pgm.createTable('user_preferences', {
       user_id: {
         type: 'uuid',
         primaryKey: true,
         references: 'users(id)',
         onDelete: 'CASCADE'
       },
       studied_languages: {
         type: 'jsonb',
         notNull: true,
         default: '[]',
         comment: 'Array of language codes'
       },
       focus_mode_enabled: {
         type: 'boolean',
         notNull: true,
         default: false
       },
       focus_language: {
         type: 'varchar(2)',
         notNull: false
       },
       onboarding_completed: {
         type: 'boolean',
         notNull: true,
         default: false
       },
       settings: {
         type: 'jsonb',
         notNull: true,
         default: '{}'
       },
       updated_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // User Progress (curriculum tracking)
     pgm.createTable('user_progress', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       user_id: {
         type: 'uuid',
         notNull: true,
         references: 'users(id)',
         onDelete: 'CASCADE'
       },
       concept_id: {
         type: 'varchar(100)',
         notNull: true,
         comment: 'References curriculum_graph.concept_id'
       },
       status: {
         type: 'varchar(20)',
         notNull: true,
         check: "status IN ('not_started', 'in_progress', 'completed')"
       },
       completion_date: {
         type: 'timestamp',
         notNull: false
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       },
       updated_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // User Vocabulary (word-level tracking)
     pgm.createTable('user_vocabulary', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       user_id: {
         type: 'uuid',
         notNull: true,
         references: 'users(id)',
         onDelete: 'CASCADE'
       },
       word: {
         type: 'varchar(100)',
         notNull: true
       },
       language: {
         type: 'varchar(2)',
         notNull: true
       },
       state: {
         type: 'varchar(20)',
         notNull: true,
         check: "state IN ('unknown', 'learning', 'known')"
       },
       first_seen: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       },
       last_reviewed: {
         type: 'timestamp',
         notNull: false
       },
       review_count: {
         type: 'integer',
         notNull: true,
         default: 0
       },
       updated_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // SRS Schedule (spaced repetition)
     pgm.createTable('user_srs_schedule', {
       id: {
         type: 'uuid',
         primaryKey: true,
         default: pgm.func('gen_random_uuid()')
       },
       user_id: {
         type: 'uuid',
         notNull: true,
         references: 'users(id)',
         onDelete: 'CASCADE'
       },
       item_type: {
         type: 'varchar(20)',
         notNull: true,
         check: "item_type IN ('vocabulary', 'grammar', 'sentence', 'exercise')"
       },
       item_id: {
         type: 'varchar(100)',
         notNull: true
       },
       due_date: {
         type: 'timestamp',
         notNull: true
       },
       interval_days: {
         type: 'integer',
         notNull: true,
         default: 1
       },
       ease_factor: {
         type: 'decimal(3,2)',
         notNull: true,
         default: 2.5
       },
       repetitions: {
         type: 'integer',
         notNull: true,
         default: 0
       },
       created_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       },
       updated_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // User Statistics
     pgm.createTable('user_statistics', {
       user_id: {
         type: 'uuid',
         primaryKey: true,
         references: 'users(id)',
         onDelete: 'CASCADE'
       },
       total_study_time_minutes: {
         type: 'integer',
         notNull: true,
         default: 0
       },
       exercises_completed: {
         type: 'integer',
         notNull: true,
         default: 0
       },
       current_streak_days: {
         type: 'integer',
         notNull: true,
         default: 0
       },
       longest_streak_days: {
         type: 'integer',
         notNull: true,
         default: 0
       },
       last_study_date: {
         type: 'date',
         notNull: false
       },
       achievements: {
         type: 'jsonb',
         notNull: true,
         default: '[]'
       },
       updated_at: {
         type: 'timestamp',
         notNull: true,
         default: pgm.func('current_timestamp')
       }
     });

     // Create indexes
     pgm.createIndex('user_progress', ['user_id', 'concept_id'], { unique: true });
     pgm.createIndex('user_vocabulary', ['user_id', 'word', 'language'], { unique: true });
     pgm.createIndex('user_vocabulary', ['user_id', 'state']);
     pgm.createIndex('user_srs_schedule', ['user_id', 'due_date']);
     pgm.createIndex('user_srs_schedule', ['user_id', 'item_type', 'item_id'], { unique: true });
   }

   export async function down(pgm: MigrationBuilder): Promise<void> {
     pgm.dropTable('user_statistics');
     pgm.dropTable('user_srs_schedule');
     pgm.dropTable('user_vocabulary');
     pgm.dropTable('user_progress');
     pgm.dropTable('user_preferences');
   }
   ```

**Files Created**:
- `packages/db/src/migrations/004_create_user_progress_tables.ts`

---

### Task 6: Configure Connection Pooling

**Description**: Set up PostgreSQL connection pool with proper configuration.

**Implementation Plan**:

1. Create `packages/db/src/connection.ts`:
   ```typescript
   import { Pool, PoolConfig } from 'pg';

   const poolConfig: PoolConfig = {
     connectionString: process.env.DATABASE_URL,
     max: process.env.NODE_ENV === 'production' ? 20 : 10,
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   };

   export const pool = new Pool(poolConfig);

   pool.on('error', (err) => {
     console.error('Unexpected error on idle client', err);
     process.exit(-1);
   });

   export async function query(text: string, params?: any[]) {
     const start = Date.now();
     const res = await pool.query(text, params);
     const duration = Date.now() - start;

     if (duration > 100) {
       console.warn('Slow query detected', { text, duration, rows: res.rowCount });
     }

     return res;
   }

   export async function getClient() {
     return await pool.connect();
   }

   export async function close() {
     await pool.end();
   }
   ```

2. Export from `packages/db/src/index.ts`:
   ```typescript
   export { pool, query, getClient, close } from './connection';
   ```

**Files Created**:
- `packages/db/src/connection.ts`

---

### Task 7: Create Development Seed Data

**Description**: Provide seed data for local development and testing.

**Implementation Plan**:

1. Create `packages/db/src/seeds/dev-seed.ts`:
   ```typescript
   import { query } from '../connection';
   import bcrypt from 'bcrypt';

   export async function seedDevelopmentData() {
     console.log('Seeding development data...');

     // Create test users
     const passwordHash = await bcrypt.hash('password123', 10);

     await query(`
       INSERT INTO users (email, password_hash, role, base_language)
       VALUES
         ('learner@test.com', $1, 'learner', 'EN'),
         ('operator@test.com', $1, 'operator', 'EN')
       ON CONFLICT (email) DO NOTHING
     `, [passwordHash]);

     // Create sample approved meaning
     await query(`
       INSERT INTO approved_meanings (id, level, tags, russian_gloss)
       VALUES ('greeting-hello', 'A0', '["greetings"]', 'Привет')
       ON CONFLICT (id) DO NOTHING
     `);

     // Create sample utterances
     await query(`
       INSERT INTO approved_utterances (meaning_id, language, text)
       VALUES
         ('greeting-hello', 'EN', 'Hello'),
         ('greeting-hello', 'IT', 'Ciao'),
         ('greeting-hello', 'PT', 'Olá'),
         ('greeting-hello', 'SL', 'Zdravo'),
         ('greeting-hello', 'ES', 'Hola')
       ON CONFLICT DO NOTHING
     `);

     console.log('✅ Development data seeded');
   }
   ```

2. Create `packages/db/src/seeds/index.ts`:
   ```typescript
   import { seedDevelopmentData } from './dev-seed';
   import { close } from '../connection';

   async function main() {
     try {
       await seedDevelopmentData();
     } catch (error) {
       console.error('Error seeding data:', error);
       process.exit(1);
     } finally {
       await close();
     }
   }

   main();
   ```

**Files Created**:
- `packages/db/src/seeds/dev-seed.ts`
- `packages/db/src/seeds/index.ts`

---

### Task 8: Test Migrations & Schema

**Description**: Verify all migrations run correctly and schema is valid.

**Implementation Plan**:

1. Set up test database in docker-compose:
   ```yaml
   # Already configured in docker-compose.yml from F003
   ```

2. Run migrations:
   ```bash
   docker-compose up -d db
   export DATABASE_URL=postgres://dev:dev@localhost:5432/polyladder
   pnpm --filter @polyladder/db migrate:up
   ```

3. Verify tables created:
   ```bash
   psql $DATABASE_URL -c "\dt"
   ```
   Expected: All 15+ tables listed

4. Run seed:
   ```bash
   pnpm --filter @polyladder/db seed
   ```

5. Verify data:
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM users;"
   psql $DATABASE_URL -c "SELECT * FROM approved_meanings;"
   ```

6. Test rollback:
   ```bash
   pnpm --filter @polyladder/db migrate:down
   pnpm --filter @polyladder/db migrate:up
   ```

**Validation**:
- ✅ All migrations run without errors
- ✅ All tables created with correct schema
- ✅ Indexes created
- ✅ Foreign key constraints work
- ✅ Seed data inserts successfully
- ✅ Rollback works

---

## Dependencies

- **Blocks**: F002 (Core Domain Model needs database schema)
- **Blocks**: F004-F060 (All features depend on database)
- **Depends on**: F000 (Project Setup)

---

## Notes

- Use UUID for primary keys (except where semantic IDs make sense, like `approved_meanings.id`)
- All timestamps use `timestamp` type (UTC)
- JSONB used for flexible/dynamic data (tags, metadata, arrays)
- Foreign keys use `ON DELETE CASCADE` for user-owned data
- No soft deletes - use deprecation for approved data instead
- Connection pool size: 10 (dev), 20 (prod)

---

## Open Questions

### 1. Primary Key Strategy: UUID vs Sequential IDs

**Question**: Should we use UUIDs (universally unique identifiers) or sequential integers for primary keys across all tables?

**Current Approach**: UUIDs (`gen_random_uuid()`) for most tables, with exceptions for semantic IDs like `approved_meanings.id` which uses sequences for readability in URLs/debugging.

**Alternatives**:
1. **UUIDs everywhere** (current default): Globally unique, enables distributed generation, prevents enumeration attacks, but larger index size (16 bytes vs 4/8 bytes) and random insertion can cause index fragmentation.
2. **Sequential integers everywhere**: Smallest storage, best index performance, predictable ordering, but requires centralized sequence generation, enables enumeration, reveals creation order/volume.
3. **Hybrid approach** (current): UUIDs for user-generated content (`user_srs_items`, `practice_attempts`), sequences for shared knowledge base (`approved_meanings`, `approved_utterances`). Balances security with performance.
4. **ULID (Universally Unique Lexicographically Sortable ID)**: UUID-sized but lexicographically sortable by creation time. Best of both worlds but requires extension/library.

**Recommendation**: Continue with **hybrid approach** (Option 3) but add UUIDv7 consideration. Use UUIDs for:
- User data (privacy, distributed generation)
- Audit/event tables (high volume, need uniqueness)

Use sequences for:
- Shared knowledge base (readability in debugging, API responses)
- Small lookup tables (languages, roles)

For high-volume tables, consider **UUIDv7** (time-ordered UUIDs) which provide UUID security with sequential-like insert performance. Implement via PostgreSQL extension or application-level generation.

---

### 2. Table Partitioning Strategy for Scale

**Question**: Which tables should be partitioned, and by what criteria - time-based, hash-based, or list-based partitioning?

**Current Approach**: No partitioning implemented. All tables use standard single-partition design. This works for MVP but may not scale to millions of users or billions of practice attempts.

**Alternatives**:
1. **No partitioning** (current): Simplest approach, relies on indexes for performance. Works until tables exceed ~10M rows or queries become too slow.
2. **Time-based partitioning**: Partition by created_at (monthly/quarterly). Best for time-series data like `practice_attempts`, `srs_reviews`. Enables efficient archival and old data deletion.
3. **Hash partitioning by user_id**: Distribute user data across N partitions. Good for `user_srs_items`, `user_language_progress`. Balances load but makes user-specific queries complex.
4. **List partitioning by language**: Partition shared knowledge base by language. Each language gets own partition. Good for `approved_utterances`, `approved_vocabulary`.
5. **Composite partitioning**: Combine strategies (e.g., partition by language, then sub-partition by time).

**Recommendation**: Implement **lazy partitioning** - design schema to support partitioning but don't implement until needed. Specific strategy per table:
- **`practice_attempts`, `srs_reviews`**: Time-based (monthly), after 10M rows
- **`user_srs_items`**: Hash by `user_id`, after 50M rows
- **`approved_utterances`**: List by language, if any single language exceeds 1M utterances

Add partitioning in migration files when thresholds approached. Monitor table sizes in production dashboard (F025).

---

### 3. JSONB Indexing and Query Performance

**Question**: How should we index JSONB columns (`metadata`, `tags`, `extra_fields`) to ensure query performance as data grows?

**Current Approach**: JSONB columns used for flexible schema (`metadata` in many tables, `tags` arrays, `acceptable_translations` in translation exercises). No specific indexing strategy documented beyond standard B-tree indexes on scalar columns.

**Alternatives**:
1. **No JSONB indexes** (current): Rely on full table scans for JSONB queries. Simple but degrades performance as tables grow.
2. **GIN indexes on entire JSONB column**: `CREATE INDEX idx_metadata ON table USING GIN (metadata)`. Supports all JSONB operators but large index size.
3. **Partial indexes on specific JSON paths**: `CREATE INDEX idx_metadata_source ON table ((metadata->>'source'))` for frequently queried fields. Targeted and efficient but requires knowing query patterns upfront.
4. **Expression indexes for computed values**: `CREATE INDEX idx_metadata_difficulty ON table (CAST(metadata->>'difficulty_score' AS FLOAT))` for numeric comparisons.
5. **Hybrid**: GIN index for existence checks (`metadata ? 'key'`), expression indexes for specific filters.

**Recommendation**: Implement **query-driven indexing** (Option 5 hybrid). Start with:
- **GIN indexes** on `tags` arrays (used for filtering): `CREATE INDEX idx_utterances_tags ON approved_utterances USING GIN (tags)`
- **Expression indexes** on commonly filtered metadata fields:
  - `(metadata->>'source')` for content source filtering
  - `(metadata->>'concept_key')` for grammar concept matching
  - `CAST(metadata->>'difficulty_score' AS FLOAT)` for difficulty-based queries

Monitor slow query logs (pg_stat_statements) to identify additional index candidates. Document index creation in migration files with comments explaining query patterns. Set `gin_pending_list_limit = 4MB` for efficient GIN updates.
