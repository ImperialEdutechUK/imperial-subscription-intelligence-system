/**
 * Next.js requires a root layout even when the app serves nothing but route
 * handlers. Nothing here is ever rendered to a user — the only HTML this
 * service returns is the status page at `/`.
 */
export const metadata = {
  title: 'Imperial Edutech — Subscription API',
  description: 'API service for the subscription register.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body
        style={{
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: '3rem 1.5rem',
          background: '#faf9f8',
          color: '#231b1a',
        }}
      >
        {children}
      </body>
    </html>
  );
}
