import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pool, QueryResult } from 'pg';
import { FocusModeService, FocusModeError } from '../../../../src/services/focus-mode';

// Mock pg Pool
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as unknown as Pool;

describe('FocusModeService', () => {
  let service: FocusModeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FocusModeService(mockPool);
  });

  describe('getFocusModeSettings', () => {
    it('should return focus mode settings for user', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'ru',
            focus_activated_at: now,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getFocusModeSettings('user-123');

      expect(result.userId).toBe('user-123');
      expect(result.enabled).toBe(true);
      expect(result.focusLanguage).toBe('ru');
      expect(result.activatedAt).toBeInstanceOf(Date);
      expect(result.lastToggled).toBeInstanceOf(Date);
    });

    it('should return disabled state when focus mode not set', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: false,
            focus_language: null,
            focus_activated_at: null,
            focus_last_toggled: null,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getFocusModeSettings('user-123');

      expect(result.enabled).toBe(false);
      expect(result.focusLanguage).toBeNull();
      expect(result.activatedAt).toBeNull();
    });

    it('should throw error when user preferences not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(service.getFocusModeSettings('user-123')).rejects.toThrow(
        'User preferences not found'
      );
    });
  });

  describe('enableFocusMode', () => {
    it('should enable focus mode for a language user is learning', async () => {
      const now = new Date();

      // Mock language check
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'ru' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock update preferences
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'ru',
            focus_activated_at: now,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock history insert
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.enableFocusMode('user-123', 'ru');

      expect(result.enabled).toBe(true);
      expect(result.focusLanguage).toBe('ru');
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should throw error if user is not learning the language', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(service.enableFocusMode('user-123', 'ru')).rejects.toThrow(
        'User is not learning ru'
      );
    });

    it('should throw error if user preferences not found on update', async () => {
      // Mock language check passes
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'ru' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock update returns empty
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(service.enableFocusMode('user-123', 'ru')).rejects.toThrow(
        'User preferences not found'
      );
    });
  });

  describe('disableFocusMode', () => {
    it('should disable focus mode', async () => {
      const now = new Date();

      // Mock update preferences
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: false,
            focus_language: 'ru',
            focus_activated_at: now,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock history insert
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.disableFocusMode('user-123');

      expect(result.enabled).toBe(false);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should not log history if no focus language was set', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: false,
            focus_language: null,
            focus_activated_at: null,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.disableFocusMode('user-123');

      expect(result.enabled).toBe(false);
      expect(mockQuery).toHaveBeenCalledTimes(1); // No history insert
    });

    it('should throw error if user preferences not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(service.disableFocusMode('user-123')).rejects.toThrow(
        'User preferences not found'
      );
    });
  });

  describe('switchFocusLanguage', () => {
    it('should switch focus language when focus mode is enabled', async () => {
      const now = new Date();

      // Mock language check
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'zh' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock get current settings
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'ru',
            focus_activated_at: now,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock update preferences
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'zh',
            focus_activated_at: now,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock history insert
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.switchFocusLanguage('user-123', 'zh');

      expect(result.enabled).toBe(true);
      expect(result.focusLanguage).toBe('zh');
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it('should throw error if user is not learning the new language', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      await expect(service.switchFocusLanguage('user-123', 'zh')).rejects.toThrow(
        'User is not learning zh'
      );
    });

    it('should throw error if focus mode is not enabled', async () => {
      const now = new Date();

      // Mock language check
      mockQuery.mockResolvedValueOnce({
        rows: [{ language: 'zh' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock get current settings - focus mode disabled
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: false,
            focus_language: null,
            focus_activated_at: null,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      await expect(service.switchFocusLanguage('user-123', 'zh')).rejects.toThrow(
        'Focus mode is not enabled'
      );
    });
  });

  describe('applyFocusFilter', () => {
    it('should return only focus language when focus mode is enabled', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'ru',
            focus_activated_at: now,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.applyFocusFilter('user-123', ['ru', 'zh', 'es']);

      expect(result).toEqual(['ru']);
    });

    it('should return original list when focus mode is disabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: false,
            focus_language: null,
            focus_activated_at: null,
            focus_last_toggled: null,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const languages = ['ru', 'zh', 'es'];
      const result = await service.applyFocusFilter('user-123', languages);

      expect(result).toEqual(languages);
    });

    it('should return empty array if focus language not in list', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'ar',
            focus_activated_at: now,
            focus_last_toggled: now,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.applyFocusFilter('user-123', ['ru', 'zh', 'es']);

      expect(result).toEqual([]);
    });
  });

  describe('getFocusModeStats', () => {
    it('should return focus mode statistics', async () => {
      // Mock total sessions
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '5' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock current streak
      mockQuery.mockResolvedValueOnce({
        rows: [{ current_streak: '3' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock longest streak
      mockQuery.mockResolvedValueOnce({
        rows: [{ longest_streak: '7' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock total focused minutes
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_minutes: '120' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock language breakdown
      mockQuery.mockResolvedValueOnce({
        rows: [
          { language: 'ru', sessions_count: '3', minutes_practiced: '80' },
          { language: 'zh', sessions_count: '2', minutes_practiced: '40' },
        ],
        rowCount: 2,
      } as unknown as QueryResult);

      const result = await service.getFocusModeStats('user-123');

      expect(result.totalFocusSessions).toBe(5);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(7);
      expect(result.totalFocusedMinutes).toBe(120);
      expect(result.languageBreakdown).toHaveLength(2);
      expect(result.languageBreakdown[0].language).toBe('ru');
      expect(result.languageBreakdown[0].sessionsCount).toBe(3);
    });

    it('should handle empty statistics', async () => {
      // Mock total sessions (empty)
      mockQuery.mockResolvedValueOnce({
        rows: [{ total: '0' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock current streak (empty)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      // Mock longest streak (empty)
      mockQuery.mockResolvedValueOnce({
        rows: [{ longest_streak: '0' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock total focused minutes (empty)
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_minutes: '0' }],
        rowCount: 1,
      } as unknown as QueryResult);

      // Mock language breakdown (empty)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as unknown as QueryResult);

      const result = await service.getFocusModeStats('user-123');

      expect(result.totalFocusSessions).toBe(0);
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.totalFocusedMinutes).toBe(0);
      expect(result.languageBreakdown).toHaveLength(0);
    });
  });

  describe('getFocusModeHistory', () => {
    it('should return focus mode history', async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            language: 'ru',
            action: 'enabled',
            created_at: now,
            metadata: null,
          },
          {
            language: 'zh',
            action: 'switched',
            created_at: now,
            metadata: { from: 'ru' },
          },
          {
            language: 'zh',
            action: 'disabled',
            created_at: now,
            metadata: null,
          },
        ],
        rowCount: 3,
      } as unknown as QueryResult);

      const result = await service.getFocusModeHistory('user-123');

      expect(result).toHaveLength(3);
      expect(result[0].language).toBe('ru');
      expect(result[0].action).toBe('enabled');
      expect(result[1].metadata).toEqual({ from: 'ru' });
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            language: 'ru',
            action: 'enabled',
            created_at: new Date(),
            metadata: null,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      await service.getFocusModeHistory('user-123', 10);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-123', 10]);
    });
  });

  describe('isFocusModeEnabled', () => {
    it('should return true when focus mode is enabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'ru',
            focus_activated_at: new Date(),
            focus_last_toggled: new Date(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.isFocusModeEnabled('user-123');

      expect(result).toBe(true);
    });

    it('should return false when focus mode is disabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: false,
            focus_language: null,
            focus_activated_at: null,
            focus_last_toggled: null,
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.isFocusModeEnabled('user-123');

      expect(result).toBe(false);
    });
  });

  describe('getCurrentFocusLanguage', () => {
    it('should return focus language when focus mode is enabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: true,
            focus_language: 'ru',
            focus_activated_at: new Date(),
            focus_last_toggled: new Date(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getCurrentFocusLanguage('user-123');

      expect(result).toBe('ru');
    });

    it('should return null when focus mode is disabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            focus_mode_enabled: false,
            focus_language: 'ru',
            focus_activated_at: new Date(),
            focus_last_toggled: new Date(),
          },
        ],
        rowCount: 1,
      } as unknown as QueryResult);

      const result = await service.getCurrentFocusLanguage('user-123');

      expect(result).toBeNull();
    });
  });

  describe('FocusModeError', () => {
    it('should create error with default status code', () => {
      const error = new FocusModeError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('FocusModeError');
    });

    it('should create error with custom status code', () => {
      const error = new FocusModeError('Not found', 404);

      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
    });
  });
});
