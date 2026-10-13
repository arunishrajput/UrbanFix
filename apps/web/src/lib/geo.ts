import { useCallback, useEffect, useRef, useState } from 'react';

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
}

type GeoState =
  | { status: 'idle' | 'locating'; fix: Fix | null; error: null }
  | { status: 'ready'; fix: Fix; error: null }
  | { status: 'error'; fix: Fix | null; error: string };

const MESSAGES: Record<number, string> = {
  0: 'This device cannot share its location. Place the pin on the map.',
  1: 'Location permission was denied. Allow location access, or place the pin on the map yourself.',
  2: 'Your location could not be determined. Move to an open area or place the pin yourself.',
  3: 'Finding your location took too long. Try again or place the pin yourself.',
};

const supported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

/**
 * Watches the GPS until the fix is accurate enough (default ≤ 30 m) or the
 * timeout passes, keeping the best reading so far. `locate()` starts another attempt.
 */
export function useGeolocation({ auto = true, targetAccuracy = 30, timeoutMs = 10_000 } = {}) {
  const [state, setState] = useState<GeoState>(() =>
    !supported()
      ? { status: 'error', fix: null, error: MESSAGES[0]! }
      : { status: auto ? 'locating' : 'idle', fix: null, error: null },
  );
  const [attempt, setAttempt] = useState(auto ? 1 : 0);
  const best = useRef<Fix | null>(null);

  useEffect(() => {
    if (!attempt || !supported()) return;
    let done = false;
    const finish = (next: (s: GeoState) => GeoState) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      window.clearTimeout(timer);
      setState(next);
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        if (!best.current || fix.accuracy < best.current.accuracy) best.current = fix;
        const b = best.current;
        if (b.accuracy <= targetAccuracy) finish(() => ({ status: 'ready', fix: b, error: null }));
        else setState({ status: 'locating', fix: b, error: null });
      },
      (err) =>
        finish((s) =>
          s.fix
            ? { status: 'ready', fix: s.fix, error: null }
            : { status: 'error', fix: null, error: MESSAGES[err.code] ?? err.message },
        ),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: timeoutMs },
    );
    const timer = window.setTimeout(
      () =>
        finish((s) =>
          s.fix
            ? { status: 'ready', fix: s.fix, error: null }
            : { status: 'error', fix: null, error: MESSAGES[3]! },
        ),
      timeoutMs,
    );
    return () => {
      done = true;
      navigator.geolocation.clearWatch(id);
      window.clearTimeout(timer);
    };
  }, [attempt, targetAccuracy, timeoutMs]);

  const locate = useCallback(() => {
    if (!supported()) return;
    setState((s) => ({ status: 'locating', fix: s.fix, error: null }));
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, locate };
}
