import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE candidates 
    DROP CONSTRAINT IF EXISTS candidates_draft_id_fkey;
    
    ALTER TABLE candidates 
    ALTER COLUMN draft_id DROP NOT NULL;
    
    ALTER TABLE candidates 
    ADD CONSTRAINT candidates_draft_id_fkey 
    FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE SET NULL;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE candidates 
    DROP CONSTRAINT IF EXISTS candidates_draft_id_fkey;
    
    UPDATE candidates SET draft_id = gen_random_uuid() WHERE draft_id IS NULL;
    
    ALTER TABLE candidates 
    ALTER COLUMN draft_id SET NOT NULL;
    
    ALTER TABLE candidates 
    ADD CONSTRAINT candidates_draft_id_fkey 
    FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE;
  `);
}

