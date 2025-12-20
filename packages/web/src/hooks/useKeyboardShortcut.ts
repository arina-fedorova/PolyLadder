import { useEffect } from 'react';

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  } = {}
) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.key === key &&
        event.ctrlKey === (options.ctrlKey || false) &&
        event.shiftKey === (options.shiftKey || false) &&
        event.altKey === (options.altKey || false)
      ) {
        event.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback, options.ctrlKey, options.shiftKey, options.altKey]);
}
