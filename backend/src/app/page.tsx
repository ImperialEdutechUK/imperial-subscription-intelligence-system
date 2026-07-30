/**
 * A status page, not a user interface.
 *
 * The interface lives in the separate `frontend` service on Vercel. Anyone
 * landing here has followed the wrong URL, so say so plainly rather than
 * returning a bare 404.
 */
export const dynamic = 'force-dynamic';

export default function ApiRoot() {
  return (
    <main style={{ maxWidth: '38rem', margin: '0 auto', lineHeight: 1.6 }}>
      <p
        style={{
          display: 'inline-block',
          background: '#DA291C',
          color: '#fff',
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          padding: '0.25rem 0.6rem',
          borderRadius: '999px',
          margin: 0,
        }}
      >
        API SERVICE
      </p>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Imperial Edutech — Subscription Intelligence</h1>
      <p style={{ color: '#5c5250' }}>
        This host serves the API only. It holds the database and every write path, and it is consumed by the web
        interface, which is deployed separately.
      </p>
      <p style={{ color: '#5c5250' }}>
        Endpoints require an <code>Authorization: Bearer &lt;token&gt;</code> header. Service health is at{' '}
        <a href="/api/health" style={{ color: '#DA291C' }}>
          /api/health
        </a>
        .
      </p>
    </main>
  );
}
