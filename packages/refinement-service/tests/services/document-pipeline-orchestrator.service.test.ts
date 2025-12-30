/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { DocumentPipelineOrchestrator } from '../../src/services/document-pipeline-orchestrator.service';
import { SemanticSplitService } from '../../src/services/semantic-split.service';
import { ContentTransformerService } from '../../src/services/content-transformer.service';
import { PromotionWorker } from '../../src/services/promotion-worker.service';

vi.mock('../../src/services/document-pipeline-manager.service');
vi.mock('../../src/services/document-processor.service');
vi.mock('../../src/services/semantic-split.service');
vi.mock('../../src/services/content-transformer.service');
vi.mock('../../src/services/promotion-worker.service');

describe('DocumentPipelineOrchestrator', () => {
  let orchestrator: DocumentPipelineOrchestrator;
  let mockPool: Pool;
  let mockSemanticSplitService: SemanticSplitService;
  let mockContentTransformer: ContentTransformerService;
  let mockPromotionWorker: PromotionWorker;
  let mockPoolQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPoolQuery = vi.fn();
    mockPool = {
      query: mockPoolQuery,
    } as unknown as Pool;

    mockSemanticSplitService = {
      splitChunk: vi.fn(),
    } as unknown as SemanticSplitService;

    mockContentTransformer = {
      transformCandidate: vi.fn(),
    } as unknown as ContentTransformerService;

    mockPromotionWorker = {
      processBatch: vi.fn(),
    } as unknown as PromotionWorker;

    orchestrator = new DocumentPipelineOrchestrator(
      mockPool,
      mockSemanticSplitService,
      mockContentTransformer,
      mockPromotionWorker
    );
  });

  describe('executeChunkingTask', () => {
    it('should create map tasks for each chunk after chunking', async () => {
      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'doc-1',
        taskType: 'chunk' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const mockPipelineManager = {
        createTask: vi.fn().mockResolvedValue({ id: 'new-task' }),
        updatePipelineStage: vi.fn().mockResolvedValue(undefined),
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      const mockDocumentProcessor = {
        chunkDocument: vi.fn().mockResolvedValue(undefined),
      };

      (
        orchestrator as unknown as { documentProcessor: typeof mockDocumentProcessor }
      ).documentProcessor = mockDocumentProcessor;

      mockPoolQuery.mockResolvedValue({
        rows: [{ id: 'chunk-1' }, { id: 'chunk-2' }, { id: 'chunk-3' }],
      });

      const executeChunkingTask = (
        orchestrator as unknown as { executeChunkingTask: (task: unknown) => Promise<void> }
      ).executeChunkingTask.bind(orchestrator);
      await executeChunkingTask(task);

      expect(mockDocumentProcessor.chunkDocument).toHaveBeenCalledWith('doc-1');
      expect(mockPipelineManager.createTask).toHaveBeenCalledTimes(3);
      expect(mockPipelineManager.createTask).toHaveBeenCalledWith({
        pipelineId: 'pipeline-1',
        itemId: 'chunk-1',
        taskType: 'map',
        dependsOnTaskId: 'task-1',
      });
      expect(mockPipelineManager.updatePipelineStage).toHaveBeenCalledWith('pipeline-1', 'mapping');
    });

    it('should not create map tasks if semantic split service is not configured', async () => {
      const orchestratorWithoutService = new DocumentPipelineOrchestrator(
        mockPool,
        null,
        mockContentTransformer,
        mockPromotionWorker
      );

      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'doc-1',
        taskType: 'chunk' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const mockPipelineManager = {
        createTask: vi.fn(),
        updatePipelineStage: vi.fn(),
        updateTaskStatus: vi.fn(),
      };

      (
        orchestratorWithoutService as unknown as { pipelineManager: typeof mockPipelineManager }
      ).pipelineManager = mockPipelineManager;

      const mockDocumentProcessor = {
        chunkDocument: vi.fn().mockResolvedValue(undefined),
      };

      (
        orchestratorWithoutService as unknown as { documentProcessor: typeof mockDocumentProcessor }
      ).documentProcessor = mockDocumentProcessor;

      mockPoolQuery.mockResolvedValue({
        rows: [{ id: 'chunk-1' }],
      });

      const executeChunkingTask = (
        orchestratorWithoutService as unknown as {
          executeChunkingTask: (task: unknown) => Promise<void>;
        }
      ).executeChunkingTask.bind(orchestratorWithoutService);
      await executeChunkingTask(task);

      expect(mockPipelineManager.createTask).not.toHaveBeenCalled();
    });
  });

  describe('executeMappingTask', () => {
    it('should call semantic split service for chunk', async () => {
      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'chunk-1',
        taskType: 'map' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const mockPipelineManager = {
        updatePipelineStage: vi.fn().mockResolvedValue(undefined),
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      (mockSemanticSplitService.splitChunk as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      mockPoolQuery.mockResolvedValue({
        rows: [{ count: '0' }],
      });

      const executeMappingTask = (
        orchestrator as unknown as { executeMappingTask: (task: unknown) => Promise<void> }
      ).executeMappingTask.bind(orchestrator);
      await executeMappingTask(task);

      expect(vi.mocked(mockSemanticSplitService.splitChunk)).toHaveBeenCalledWith(
        'chunk-1',
        'pipeline-1'
      );
      expect(vi.mocked(mockPipelineManager.updatePipelineStage)).toHaveBeenCalledWith(
        'pipeline-1',
        'draft_review'
      );
    });

    it('should throw error if semantic split service is not configured', async () => {
      const orchestratorWithoutService = new DocumentPipelineOrchestrator(
        mockPool,
        null,
        mockContentTransformer,
        mockPromotionWorker
      );

      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'chunk-1',
        taskType: 'map' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const executeMappingTask = (
        orchestratorWithoutService as unknown as {
          executeMappingTask: (task: unknown) => Promise<void>;
        }
      ).executeMappingTask.bind(orchestratorWithoutService);
      await expect(executeMappingTask(task)).rejects.toThrow(
        'Semantic split service not configured'
      );
    });

    it('should not update stage if chunks remain', async () => {
      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'chunk-1',
        taskType: 'map' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const mockPipelineManager = {
        updatePipelineStage: vi.fn().mockResolvedValue(undefined),
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      (mockSemanticSplitService.splitChunk as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      mockPoolQuery.mockResolvedValue({
        rows: [{ count: '5' }],
      });

      const executeMappingTask = (
        orchestrator as unknown as { executeMappingTask: (task: unknown) => Promise<void> }
      ).executeMappingTask.bind(orchestrator);
      await executeMappingTask(task);

      expect(vi.mocked(mockSemanticSplitService.splitChunk)).toHaveBeenCalledWith(
        'chunk-1',
        'pipeline-1'
      );
      expect(vi.mocked(mockPipelineManager.updatePipelineStage)).not.toHaveBeenCalledWith(
        'pipeline-1',
        'draft_review'
      );
    });
  });

  describe('executeTransformationTask', () => {
    it('should call transformCandidate for candidate', async () => {
      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'candidate-1',
        taskType: 'transform' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const mockPipelineManager = {
        updatePipelineStage: vi.fn().mockResolvedValue(undefined),
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      (mockContentTransformer.transformCandidate as ReturnType<typeof vi.fn>).mockResolvedValue({
        validatedId: 'validated-1',
      });

      mockPoolQuery.mockResolvedValue({
        rows: [{ count: '0' }],
      });

      const executeTransformationTask = (
        orchestrator as unknown as {
          executeTransformationTask: (task: unknown) => Promise<void>;
        }
      ).executeTransformationTask.bind(orchestrator);
      await executeTransformationTask(task);

      expect(vi.mocked(mockContentTransformer.transformCandidate)).toHaveBeenCalledWith(
        'candidate-1'
      );
      expect(vi.mocked(mockPipelineManager.updatePipelineStage)).toHaveBeenCalledWith(
        'pipeline-1',
        'validating'
      );
    });

    it('should throw error if content transformer is not configured', async () => {
      const orchestratorWithoutService = new DocumentPipelineOrchestrator(
        mockPool,
        mockSemanticSplitService,
        null,
        mockPromotionWorker
      );

      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'candidate-1',
        taskType: 'transform' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const executeTransformationTask = (
        orchestratorWithoutService as unknown as {
          executeTransformationTask: (task: unknown) => Promise<void>;
        }
      ).executeTransformationTask.bind(orchestratorWithoutService);
      await expect(executeTransformationTask(task)).rejects.toThrow(
        'Content transformer not configured'
      );
    });

    it('should not update stage if candidates remain', async () => {
      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'candidate-1',
        taskType: 'transform' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const mockPipelineManager = {
        updatePipelineStage: vi.fn().mockResolvedValue(undefined),
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      (mockContentTransformer.transformCandidate as ReturnType<typeof vi.fn>).mockResolvedValue({
        validatedId: 'validated-1',
      });

      mockPoolQuery.mockResolvedValue({
        rows: [{ count: '3' }],
      });

      const executeTransformationTask = (
        orchestrator as unknown as {
          executeTransformationTask: (task: unknown) => Promise<void>;
        }
      ).executeTransformationTask.bind(orchestrator);
      await executeTransformationTask(task);

      expect(vi.mocked(mockContentTransformer.transformCandidate)).toHaveBeenCalledWith(
        'candidate-1'
      );
      expect(vi.mocked(mockPipelineManager.updatePipelineStage)).not.toHaveBeenCalledWith(
        'pipeline-1',
        'validating'
      );
    });

    it('should handle null result from transformCandidate', async () => {
      const task = {
        id: 'task-1',
        pipelineId: 'pipeline-1',
        itemId: 'candidate-1',
        taskType: 'transform' as const,
        status: 'pending' as const,
        dependsOnTaskId: null,
      };

      const mockPipelineManager = {
        updatePipelineStage: vi.fn().mockResolvedValue(undefined),
        updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      (mockContentTransformer.transformCandidate as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      const executeTransformationTask = (
        orchestrator as unknown as {
          executeTransformationTask: (task: unknown) => Promise<void>;
        }
      ).executeTransformationTask.bind(orchestrator);
      await executeTransformationTask(task);

      expect(vi.mocked(mockContentTransformer.transformCandidate)).toHaveBeenCalledWith(
        'candidate-1'
      );
      expect(vi.mocked(mockPipelineManager.updatePipelineStage)).not.toHaveBeenCalled();
    });
  });

  describe('createTransformationTasksForCandidates', () => {
    it('should create transform tasks for unprocessed candidates', async () => {
      const mockPipelineManager = {
        createTask: vi.fn().mockResolvedValue({ id: 'new-task' }),
        updatePipelineStage: vi.fn().mockResolvedValue(undefined),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      mockPoolQuery.mockResolvedValue({
        rows: [{ id: 'candidate-1' }, { id: 'candidate-2' }],
      });

      await (
        orchestrator as unknown as {
          createTransformationTasksForCandidates: (
            pipelineId: string,
            documentId: string
          ) => Promise<void>;
        }
      ).createTransformationTasksForCandidates('pipeline-1', 'doc-1');

      expect(mockPipelineManager.createTask).toHaveBeenCalledTimes(2);
      expect(mockPipelineManager.createTask).toHaveBeenCalledWith({
        pipelineId: 'pipeline-1',
        itemId: 'candidate-1',
        taskType: 'transform',
      });
      expect(mockPipelineManager.updatePipelineStage).toHaveBeenCalledWith(
        'pipeline-1',
        'transforming',
        'processing'
      );
    });

    it('should not update stage if no candidates found', async () => {
      const mockPipelineManager = {
        createTask: vi.fn(),
        updatePipelineStage: vi.fn(),
      };

      (orchestrator as unknown as { pipelineManager: typeof mockPipelineManager }).pipelineManager =
        mockPipelineManager;

      mockPoolQuery.mockResolvedValue({
        rows: [],
      });

      await (
        orchestrator as unknown as {
          createTransformationTasksForCandidates: (
            pipelineId: string,
            documentId: string
          ) => Promise<void>;
        }
      ).createTransformationTasksForCandidates('pipeline-1', 'doc-1');

      expect(mockPipelineManager.createTask).not.toHaveBeenCalled();
      expect(mockPipelineManager.updatePipelineStage).not.toHaveBeenCalled();
    });
  });
});
