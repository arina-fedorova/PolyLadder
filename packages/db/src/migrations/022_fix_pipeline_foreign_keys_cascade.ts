import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE candidates 
    DROP CONSTRAINT IF EXISTS candidates_draft_id_fkey;
    
    ALTER TABLE candidates 
    ADD CONSTRAINT candidates_draft_id_fkey 
    FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE;
    
    ALTER TABLE validated 
    DROP CONSTRAINT IF EXISTS validated_candidate_id_fkey;
    
    ALTER TABLE validated 
    ADD CONSTRAINT validated_candidate_id_fkey 
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;
    
    ALTER TABLE validation_failures 
    DROP CONSTRAINT IF EXISTS validation_failures_candidate_id_fkey;
    
    ALTER TABLE validation_failures 
    ADD CONSTRAINT validation_failures_candidate_id_fkey 
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql(`
    ALTER TABLE candidates 
    DROP CONSTRAINT IF EXISTS candidates_draft_id_fkey;
    
    ALTER TABLE candidates 
    ADD CONSTRAINT candidates_draft_id_fkey 
    FOREIGN KEY (draft_id) REFERENCES drafts(id);
    
    ALTER TABLE validated 
    DROP CONSTRAINT IF EXISTS validated_candidate_id_fkey;
    
    ALTER TABLE validated 
    ADD CONSTRAINT validated_candidate_id_fkey 
    FOREIGN KEY (candidate_id) REFERENCES candidates(id);
    
    ALTER TABLE validation_failures 
    DROP CONSTRAINT IF EXISTS validation_failures_candidate_id_fkey;
    
    ALTER TABLE validation_failures 
    ADD CONSTRAINT validation_failures_candidate_id_fkey 
    FOREIGN KEY (candidate_id) REFERENCES candidates(id);
  `);
}
