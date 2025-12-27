import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';
import * as fs from 'fs';
import * as path from 'path';

export const shorthands: ColumnDefinitions | undefined = undefined;

interface TopicData {
  name: string;
  slug: string;
  description: string;
  content_type: 'vocabulary' | 'grammar' | 'orthography' | 'mixed';
  sort_order: number;
  estimated_items: number;
}

interface CurriculumData {
  [language: string]: {
    [cefrLevel: string]: TopicData[];
  };
}

function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''").replace(/\\/g, '\\\\');
}

export function up(pgm: MigrationBuilder): void {
  const cwd = process.cwd();
  const possiblePaths = [
    path.resolve(cwd, 'packages/db/src/data/curriculum_scheme.json'),
    path.resolve(cwd, 'src/data/curriculum_scheme.json'),
  ];

  let jsonPath: string | null = null;
  for (const possiblePath of possiblePaths) {
    try {
      if (fs.existsSync(possiblePath)) {
        jsonPath = possiblePath;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!jsonPath) {
    throw new Error(
      `Could not find curriculum_scheme.json. Tried: ${possiblePaths.join(', ')}. Current working directory: ${cwd}`
    );
  }

  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(jsonContent) as CurriculumData;

  for (const [language, levels] of Object.entries(data)) {
    for (const [cefrLevel, topics] of Object.entries(levels)) {
      if (topics.length === 0) continue;

      const values: string[] = [];
      for (const topic of topics) {
        const name = escapeSqlString(topic.name);
        const slug = escapeSqlString(topic.slug);
        const description = escapeSqlString(topic.description);
        const contentType = topic.content_type;
        const sortOrder = topic.sort_order;
        const estimatedItems = topic.estimated_items;

        values.push(
          `('${name}', '${slug}', '${description}', '${contentType}', ${sortOrder}, ${estimatedItems})`
        );
      }

      const topicsSQL = values.join(',\n          ');

      pgm.sql(`
        INSERT INTO curriculum_topics (level_id, name, slug, description, content_type, sort_order, estimated_items)
        SELECT
          (SELECT id FROM curriculum_levels WHERE language = '${language}' AND cefr_level = '${cefrLevel}' LIMIT 1) as level_id,
          topic_data.name,
          topic_data.slug,
          topic_data.description,
          topic_data.content_type::varchar(50),
          topic_data.sort_order,
          topic_data.estimated_items
        FROM (
          VALUES
            ${topicsSQL}
        ) AS topic_data(name, slug, description, content_type, sort_order, estimated_items)
        WHERE (SELECT id FROM curriculum_levels WHERE language = '${language}' AND cefr_level = '${cefrLevel}' LIMIT 1) IS NOT NULL
        ON CONFLICT (level_id, slug) DO NOTHING;
      `);
    }
  }
}

export function down(pgm: MigrationBuilder): void {
  const cwd = process.cwd();
  const possiblePaths = [
    path.resolve(cwd, 'packages/db/src/data/curriculum_scheme.json'),
    path.resolve(cwd, 'src/data/curriculum_scheme.json'),
  ];

  let jsonPath: string | null = null;
  for (const possiblePath of possiblePaths) {
    try {
      if (fs.existsSync(possiblePath)) {
        jsonPath = possiblePath;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!jsonPath) {
    throw new Error(
      `Could not find curriculum_scheme.json. Tried: ${possiblePaths.join(', ')}. Current working directory: ${cwd}`
    );
  }

  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(jsonContent) as CurriculumData;

  const slugs: string[] = [];
  for (const levels of Object.values(data)) {
    for (const topics of Object.values(levels)) {
      for (const topic of topics) {
        slugs.push(`'${escapeSqlString(topic.slug)}'`);
      }
    }
  }

  if (slugs.length > 0) {
    const slugsSQL = slugs.join(', ');
    pgm.sql(`
      DELETE FROM curriculum_topics 
      WHERE slug IN (${slugsSQL});
    `);
  }
}
