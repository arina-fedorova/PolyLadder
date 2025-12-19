export interface DeprecationParams {
  itemId: string;
  itemType: string;
  reason: string;
  replacementId?: string;
  operatorId: string;
}

export interface DeprecationRecord {
  id: string;
  itemId: string;
  itemType: string;
  reason: string;
  replacementId?: string;
  operatorId: string;
  deprecatedAt: Date;
}

export interface DeprecationRepository {
  createDeprecation(params: DeprecationParams): Promise<DeprecationRecord>;
  isDeprecated(itemId: string): Promise<boolean>;
  getDeprecation(itemId: string): Promise<DeprecationRecord | null>;
  getReplacement(itemId: string): Promise<string | null>;
}

export class DeprecationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeprecationError';
  }
}

export async function deprecateItem(
  repository: DeprecationRepository,
  params: DeprecationParams
): Promise<DeprecationRecord> {
  const alreadyDeprecated = await repository.isDeprecated(params.itemId);

  if (alreadyDeprecated) {
    throw new DeprecationError(`Item ${params.itemId} is already deprecated`);
  }

  return repository.createDeprecation(params);
}

export async function getReplacementChain(
  repository: DeprecationRepository,
  itemId: string,
  maxDepth: number = 10
): Promise<string[]> {
  const chain: string[] = [itemId];
  let currentId: string | null = itemId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    const replacement = await repository.getReplacement(currentId);
    if (!replacement || chain.includes(replacement)) {
      break;
    }
    chain.push(replacement);
    currentId = replacement;
    depth++;
  }

  return chain;
}

export async function getActiveReplacement(
  repository: DeprecationRepository,
  itemId: string
): Promise<string> {
  const chain = await getReplacementChain(repository, itemId);
  return chain[chain.length - 1];
}
