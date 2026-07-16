const BUILD = typeof __BUILD_INFO__ === 'undefined' ? {
  version: 'unknown', timestamp: 'unknown', branch: 'unknown', commit: 'unknown', features: {},
} : __BUILD_INFO__;

export default function BuildInfo() {
  return (
    <details className="build-info">
      <summary>Версия приложения: {BUILD.version} · {BUILD.commit}{BUILD.dirty ? '-dirty' : ''}</summary>
      <dl>
        <div><dt>Сборка</dt><dd>{BUILD.timestamp}</dd></div>
        <div><dt>Ветка</dt><dd>{BUILD.branch}</dd></div>
        <div><dt>Commit</dt><dd>{BUILD.commit}</dd></div>
        {Object.entries(BUILD.features).map(([key, enabled]) => <div key={key}><dt>{key}</dt><dd>{String(enabled)}</dd></div>)}
      </dl>
    </details>
  );
}
