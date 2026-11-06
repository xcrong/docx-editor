import {
  PREVIEW_BANNER_HREF,
  PREVIEW_BANNER_FORK_LABEL,
  PREVIEW_BANNER_LEAD,
  PREVIEW_BANNER_TRAIL,
} from './bannerCopy';

export function PreviewBanner() {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '6px 16px',
        background: '#fef3c7',
        color: '#92400e',
        borderBottom: '1px solid #fde68a',
        fontSize: '13px',
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      <span>
        {PREVIEW_BANNER_LEAD}
        <a
          href={PREVIEW_BANNER_HREF}
          target="_blank"
          rel="noopener"
          style={{ color: '#92400e', textDecoration: 'underline', textDecorationColor: '#fcd34d' }}
        >
          {PREVIEW_BANNER_FORK_LABEL}
        </a>
        {PREVIEW_BANNER_TRAIL}
      </span>
    </div>
  );
}
