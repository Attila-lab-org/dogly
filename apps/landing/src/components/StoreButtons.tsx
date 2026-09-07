import { APP_STORE_URL, PLAY_STORE_URL } from "@/src/lib/storeLinks";

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8.98-.2 1.92-.86 3.03-.83 1.32.03 2.32.63 2.97 1.62-2.72 1.63-2.28 5.05.43 6.37-.57 1.5-1.31 2.99-2.41 4.01ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
      <path d="M3.6 2.3c-.3.3-.5.8-.5 1.4v16.6c0 .6.2 1.1.5 1.4l.1.1 9.3-9.3v-.2L3.7 2.2l-.1.1Zm12.4 9.1-2.7-2.7 2.9-2.9 3.4 2c1 .6 1 1.5 0 2.1l-3.6 1.5Zm-.6.6-2.9 2.9-9-9c.3-.1.7-.1 1.1.1l10.8 6Zm-2.9 3.5 2.7-2.7 3.6 1.5c1 .6 1 1.5 0 2.1l-3.4 2-2.9-2.9Z" />
    </svg>
  );
}

export default function StoreButtons() {
  return (
    <div className="store-buttons">
      <a className="store-button" href={APP_STORE_URL}>
        <AppleIcon />
        <span>
          <small>Scarica su</small>
          App Store
        </span>
      </a>
      <a className="store-button" href={PLAY_STORE_URL}>
        <PlayIcon />
        <span>
          <small>Disponibile su</small>
          Google Play
        </span>
      </a>
    </div>
  );
}
