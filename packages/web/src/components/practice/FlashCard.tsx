import { useState, useEffect } from 'react';

interface FlashCardProps {
  card: {
    meaningId: string;
    word: string;
    definition: string;
    audioUrl?: string | null;
    cefrLevel: string;
  };
  onAssessment: (quality: number) => void;
  disabled: boolean;
}

export function FlashCard({ card, onAssessment, disabled }: FlashCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    // Reset on card change
    setIsFlipped(false);
  }, [card.meaningId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (disabled) return;

      if (e.code === 'Space' && !isFlipped) {
        e.preventDefault();
        setIsFlipped(true);
        if (card.audioUrl) {
          void playAudio();
        }
      } else if (isFlipped) {
        switch (e.key) {
          case '1':
            onAssessment(0); // Again
            break;
          case '2':
            onAssessment(3); // Hard
            break;
          case '3':
            onAssessment(4); // Good
            break;
          case '4':
            onAssessment(5); // Easy
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isFlipped, disabled, onAssessment, card.audioUrl]);

  const playAudio = async () => {
    if (card.audioUrl) {
      const audio = new Audio(card.audioUrl);
      await audio.play();
    }
  };

  const handleFlip = () => {
    if (!disabled) {
      setIsFlipped(true);
      if (card.audioUrl) {
        void playAudio();
      }
    }
  };

  return (
    <div className="flashcard-container">
      <div className={`flashcard ${isFlipped ? 'flipped' : ''}`}>
        {!isFlipped ? (
          // Front side - show definition
          <div className="flashcard-front card p-8 text-center min-h-[300px] flex flex-col justify-center">
            <p className="text-sm text-gray-500 mb-4">{card.cefrLevel}</p>
            <p className="text-2xl mb-6">{card.definition}</p>

            <button onClick={handleFlip} className="btn btn-primary btn-lg" disabled={disabled}>
              Show Answer (Space)
            </button>

            <p className="text-xs text-gray-500 mt-4">Think of the word first, then reveal it</p>
          </div>
        ) : (
          // Back side - show word + audio
          <div className="flashcard-back card p-8 text-center min-h-[300px] flex flex-col justify-between">
            <div>
              <p className="text-3xl font-bold mb-4">{card.word}</p>

              {card.audioUrl && (
                <button
                  onClick={() => {
                    void playAudio();
                  }}
                  className="btn btn-circle btn-lg mb-4"
                >
                  🔊
                </button>
              )}

              <p className="text-lg text-gray-600 mb-2">Was: {card.definition}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold mb-2">How well did you recall it?</p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onAssessment(0)}
                  className="btn btn-error"
                  disabled={disabled}
                >
                  Again (1)
                  <br />
                  <span className="text-xs">&lt; 1 min</span>
                </button>

                <button
                  onClick={() => onAssessment(3)}
                  className="btn btn-warning"
                  disabled={disabled}
                >
                  Hard (2)
                  <br />
                  <span className="text-xs">~6 days</span>
                </button>

                <button
                  onClick={() => onAssessment(4)}
                  className="btn btn-success"
                  disabled={disabled}
                >
                  Good (3)
                  <br />
                  <span className="text-xs">~interval</span>
                </button>

                <button
                  onClick={() => onAssessment(5)}
                  className="btn btn-primary"
                  disabled={disabled}
                >
                  Easy (4)
                  <br />
                  <span className="text-xs">~interval × EF</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
