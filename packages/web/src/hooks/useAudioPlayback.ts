import { useRef, useState, useEffect } from 'react';

interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  play: (audioUrl: string) => Promise<void>;
  pause: () => void;
  stop: () => void;
  currentAudioUrl: string | null;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const play = async (audioUrl: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    // If same audio is playing, restart it
    if (currentAudioUrl === audioUrl && isPlaying) {
      audioRef.current.currentTime = 0;
      return;
    }

    // Stop current audio if different
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }

    audioRef.current.src = audioUrl;
    setCurrentAudioUrl(audioUrl);

    // Set up event listeners
    audioRef.current.onplay = () => setIsPlaying(true);
    audioRef.current.onended = () => setIsPlaying(false);
    audioRef.current.onpause = () => setIsPlaying(false);
    audioRef.current.onerror = () => {
      console.error('Audio playback failed for:', audioUrl);
      setIsPlaying(false);
    };

    try {
      await audioRef.current.play();
    } catch (error) {
      console.error('Failed to play audio:', error);
      setIsPlaying(false);
    }
  };

  const pause = () => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  return {
    isPlaying,
    play,
    pause,
    stop,
    currentAudioUrl,
  };
}
