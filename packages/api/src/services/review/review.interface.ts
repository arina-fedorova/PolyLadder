/**
 * Review session status
 */
export type ReviewSessionStatus = 'active' | 'completed' | 'abandoned';

/**
 * Performance rating for review (maps to SM-2 quality scores)
 */
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

/**
 * Review queue item with content details
 */
export interface ReviewQueueItem {
  id: string;
  itemType: string;
  itemId: string;
  dueDate: Date;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  // Content varies by item type
  content: {
    wordText?: string;
    translation?: string;
    definition?: string;
    audioUrl?: string;
    level?: string;
  };
}

/**
 * Review session metadata
 */
export interface ReviewSession {
  id: string;
  userId: string;
  language: string | null;
  itemsReviewed: number;
  correctCount: number;
  totalResponseTimeMs: number;
  status: ReviewSessionStatus;
  startedAt: Date;
  completedAt: Date | null;
  lastActivityAt: Date;
}

/**
 * Session statistics for display
 */
export interface SessionStats {
  sessionId: string;
  itemsReviewed: number;
  correctCount: number;
  accuracyPct: number;
  durationSeconds: number;
  avgResponseTimeMs: number;
  status: ReviewSessionStatus;
  startedAt: string;
  completedAt: string | null;
}

/**
 * Result of starting a session
 */
export interface StartSessionResult {
  sessionId: string;
  itemsInQueue: number;
  startedAt: string;
}

/**
 * Review submission request
 */
export interface ReviewSubmission {
  itemId: string;
  itemType: string;
  rating: ReviewRating;
  responseTimeMs: number;
  wasCorrect: boolean;
  sessionId?: string;
}

/**
 * Result of submitting a review
 */
export interface ReviewSubmitResult {
  success: boolean;
  nextReview: {
    dueDate: string;
    interval: number;
    repetitions: number;
    easeFactor: number;
  };
}

/**
 * Review queue response
 */
export interface ReviewQueueResponse {
  total: number;
  items: ReviewQueueItem[];
  nextReviewAt: string | null;
}
