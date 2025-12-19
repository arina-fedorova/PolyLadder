import { QualityGate, QualityGateResult, GateInput, GateTier } from './types';
import { CEFRLevel } from '../domain/enums';
import { getCEFRRank } from './cefr-gate';

export interface PrerequisiteInfo {
  id: string;
  level: CEFRLevel;
  language: string;
}

export interface PrerequisiteRepository {
  findPrerequisites(ids: string[]): Promise<PrerequisiteInfo[]>;
  getPrerequisitesOf(id: string): Promise<string[]>;
}

export interface PrerequisiteValidationInput extends GateInput {
  itemId: string;
  level: CEFRLevel;
  prerequisites: string[];
}

export class PrerequisiteValidationGate implements QualityGate {
  readonly name = 'prerequisite-validation';
  readonly tier = GateTier.DATABASE;

  constructor(private readonly repository: PrerequisiteRepository) {}

  async check(input: GateInput): Promise<QualityGateResult> {
    const prereqInput = input as PrerequisiteValidationInput;
    const { itemId, level, prerequisites, language } = prereqInput;

    if (!prerequisites || prerequisites.length === 0) {
      return { passed: true, gateName: this.name };
    }

    const issues: string[] = [];

    if (prerequisites.includes(itemId)) {
      issues.push('Item cannot be its own prerequisite');
    }

    const existingPrereqs = await this.repository.findPrerequisites(prerequisites);
    const existingIds = new Set(existingPrereqs.map((p) => p.id));

    const missingIds = prerequisites.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      issues.push(`Missing prerequisites: ${missingIds.join(', ')}`);
    }

    const currentRank = getCEFRRank(level);
    for (const prereq of existingPrereqs) {
      const prereqRank = getCEFRRank(prereq.level);
      if (prereqRank > currentRank) {
        issues.push(
          `Prerequisite "${prereq.id}" has higher level (${prereq.level}) than item (${level})`
        );
      }

      if (prereq.language !== language) {
        issues.push(`Prerequisite "${prereq.id}" is in different language (${prereq.language})`);
      }
    }

    const cycle = await this.detectCircularDependency(itemId, prerequisites);
    if (cycle) {
      issues.push(`Circular dependency detected: ${cycle}`);
    }

    if (issues.length > 0) {
      return {
        passed: false,
        gateName: this.name,
        reason: 'Prerequisite validation failed',
        details: { issues, prerequisites, missingIds },
      };
    }

    return { passed: true, gateName: this.name };
  }

  private async detectCircularDependency(
    itemId: string,
    directPrereqs: string[]
  ): Promise<string | null> {
    const visited = new Set<string>();

    const dfs = async (currentId: string, path: string[]): Promise<string | null> => {
      // If we've seen this ID in current path, we have a cycle
      if (path.includes(currentId)) {
        return [...path, currentId].join(' → ');
      }

      if (visited.has(currentId)) {
        return null;
      }

      visited.add(currentId);

      const prereqs = await this.repository.getPrerequisitesOf(currentId);

      for (const prereqId of prereqs) {
        const cycle = await dfs(prereqId, [...path, currentId]);
        if (cycle) {
          return cycle;
        }
      }

      return null;
    };

    for (const prereqId of directPrereqs) {
      const cycle = await dfs(prereqId, [itemId]);
      if (cycle) {
        return cycle;
      }
    }

    return null;
  }
}

export function createPrerequisiteValidationGate(
  repository: PrerequisiteRepository
): PrerequisiteValidationGate {
  return new PrerequisiteValidationGate(repository);
}
