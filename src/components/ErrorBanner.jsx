export default function ErrorBanner({ messages }) {
  const items = [...new Set((messages || []).filter(Boolean))];
  if (items.length === 0) return null;

  return (
    <div className="error-banner" role="alert">
      {items.map((message) => <p key={message}>{message}</p>)}
    </div>
  );
}
