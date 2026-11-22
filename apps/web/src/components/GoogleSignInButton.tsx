import { useEffect, useRef } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}

type Props = {
  onCredential: (credential: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  label?: string;
};

let gsiScriptPromise: Promise<void> | null = null;
let gsiInitialized = false;
let gsiCredentialHandler: ((credential: string) => void) | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;

  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-gsi');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Sign-In')),
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

export default function GoogleSignInButton({
  onCredential,
  onError,
  disabled,
  label = 'Continue with Google',
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;
  gsiCredentialHandler = (credential) => onCredentialRef.current(credential);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || disabled) return;
    let cancelled = false;

    (async () => {
      try {
        await loadGoogleScript();
        if (cancelled || !hostRef.current || !window.google) return;

        if (!gsiInitialized) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => {
              if (response.credential) {
                gsiCredentialHandler?.(response.credential);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          gsiInitialized = true;
        }

        hostRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: Math.max(280, hostRef.current.clientWidth || 320),
          logo_alignment: 'left',
        });
      } catch (err) {
        onError?.(
          err instanceof Error ? err.message : 'Google Sign-In unavailable',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [disabled, onError]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        className="auth-google"
        disabled
        title="Set VITE_GOOGLE_CLIENT_ID in apps/web/.env"
      >
        <GoogleMark />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div
      className={`auth-google-host${disabled ? ' is-disabled' : ''}`}
      ref={hostRef}
      aria-label={label}
    />
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.6 29.3 3.5 24 3.5 12.4 3.5 3 12.9 3 24.5S12.4 45.5 24 45.5 45 36.1 45 24.5c0-1.4-.1-2.7-.4-4z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.6 29.3 3.5 24 3.5 16.3 3.5 9.6 7.8 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.7 26.7 37.5 24 37.5c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 41.1 16.2 45.5 24 45.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 36.9 45 32 45 24.5c0-1.4-.1-2.7-.4-4z"
      />
    </svg>
  );
}
