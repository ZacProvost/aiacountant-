/**
 * Custom React hooks for debouncing, throttling, and performance optimization
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { debounce, throttle } from './messageQueue';

/**
 * Hook that returns a debounced version of a callback
 * The callback will only execute after the specified delay has passed since the last call
 * 
 * @example
 * const debouncedSearch = useDebouncedCallback((query) => {
 *   performSearch(query);
 * }, 500);
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  const debouncedRef = useRef<ReturnType<typeof debounce>>();

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Create debounced function on mount or when delay changes
  useEffect(() => {
    debouncedRef.current = debounce((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);

  return useCallback((...args: Parameters<T>) => {
    debouncedRef.current?.(...args);
  }, []);
}

/**
 * Hook that returns a throttled version of a callback
 * The callback will execute at most once per specified interval
 * 
 * @example
 * const throttledScroll = useThrottledCallback((scrollPos) => {
 *   updateScrollIndicator(scrollPos);
 * }, 100);
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  const throttledRef = useRef<ReturnType<typeof throttle>>();

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Create throttled function on mount or when limit changes
  useEffect(() => {
    throttledRef.current = throttle((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, limit);
  }, [limit]);

  return useCallback((...args: Parameters<T>) => {
    throttledRef.current?.(...args);
  }, []);
}

/**
 * Hook that returns a debounced value
 * The value will only update after the specified delay has passed since the last change
 * 
 * @example
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedQuery = useDebouncedValue(searchQuery, 500);
 * 
 * useEffect(() => {
 *   performSearch(debouncedQuery);
 * }, [debouncedQuery]);
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook that tracks the previous value of a state or prop
 * 
 * @example
 * const [count, setCount] = useState(0);
 * const previousCount = usePrevious(count);
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Hook that calls a callback when clicking outside the referenced element
 * 
 * @example
 * const ref = useOnClickOutside(() => {
 *   closeModal();
 * });
 * 
 * return <div ref={ref}>Modal content</div>;
 */
export function useOnClickOutside<T extends HTMLElement = HTMLElement>(
  callback: () => void
): React.RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [callback]);

  return ref;
}

/**
 * Hook that tracks whether a component is mounted
 * Useful for preventing state updates on unmounted components
 * 
 * @example
 * const isMounted = useIsMounted();
 * 
 * async function fetchData() {
 *   const data = await api.getData();
 *   if (isMounted()) {
 *     setData(data);
 *   }
 * }
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}

/**
 * Hook for managing async operations with loading, error, and data states
 * 
 * @example
 * const { data, loading, error, execute } = useAsync(async () => {
 *   return await fetchData();
 * });
 */
export function useAsync<T, Args extends any[] = []>(
  asyncFunction: (...args: Args) => Promise<T>,
  immediate = false
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (...args: Args) => Promise<T | null>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useIsMounted();

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFunction(...args);
        if (isMounted()) {
          setData(result);
        }
        return result;
      } catch (err) {
        if (isMounted()) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
        return null;
      } finally {
        if (isMounted()) {
          setLoading(false);
        }
      }
    },
    [asyncFunction, isMounted]
  );

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { data, loading, error, execute };
}

/**
 * Hook for managing local storage with React state
 * 
 * @example
 * const [theme, setTheme] = useLocalStorage('theme', 'light');
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Update localStorage when state changes
  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * Hook for managing interval with cleanup
 * 
 * @example
 * useInterval(() => {
 *   // This will run every 1 second
 *   fetchLatestData();
 * }, 1000);
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Hook for managing window size
 * 
 * @example
 * const { width, height } = useWindowSize();
 * const isMobile = width < 768;
 */
export function useWindowSize(): { width: number; height: number } {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = throttle(() => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }, 200);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
}


