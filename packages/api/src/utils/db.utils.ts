import { PoolClient } from 'pg';

export async function withTransaction<T>(
  client: PoolClient,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export interface WhereClauseResult {
  clause: string;
  values: unknown[];
  nextParamIndex: number;
}

export function buildWhereClause(
  filters: Record<string, unknown>,
  startIndex: number = 1
): WhereClauseResult {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = startIndex;

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      conditions.push(`${key} = $${String(paramIndex)}`);
      values.push(value);
      paramIndex++;
    }
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
    nextParamIndex: paramIndex,
  };
}

export function buildPaginationClause(limit: number = 20, offset: number = 0): string {
  return `LIMIT ${String(limit)} OFFSET ${String(offset)}`;
}

export function buildOrderByClause(
  orderBy: string,
  direction: 'ASC' | 'DESC' = 'ASC',
  allowedColumns: string[]
): string {
  if (!allowedColumns.includes(orderBy)) {
    throw new Error(`Invalid order by column: ${orderBy}`);
  }
  return `ORDER BY ${orderBy} ${direction}`;
}

export function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, '\\$&');
}

export function buildSearchClause(
  column: string,
  searchTerm: string,
  paramIndex: number
): { clause: string; value: string; nextParamIndex: number } {
  const escapedTerm = escapeLikePattern(searchTerm);
  return {
    clause: `${column} ILIKE $${String(paramIndex)}`,
    value: `%${escapedTerm}%`,
    nextParamIndex: paramIndex + 1,
  };
}
