import { useEffect } from 'react';

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    ignoreInputs?: boolean;
  } = {}
) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const ignoreInputs = options.ignoreInputs ?? true;
      if (ignoreInputs) {
        const target = event.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          return;
        }
        if (target.isContentEditable) {
          return;
        }
      }

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
  }, [key, callback, options.ctrlKey, options.shiftKey, options.altKey, options.ignoreInputs]);
}
