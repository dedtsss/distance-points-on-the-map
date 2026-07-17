const BUILD = typeof __BUILD_INFO__ === 'undefined' ? {
  version: 'unknown', timestamp: 'unknown', branch: 'unknown', commit: 'unknown', features: {},
} : __BUILD_INFO__;

export default function BuildInfo() {
  return (
    <section className="build-info" aria-labelledby="build-info-title">
      <div className="panel-heading">
        <div>
          <p className="page-eyebrow">О приложении</p>
          <h3 id="build-info-title">Версия и сборка</h3>
        </div>
      </div>
      <dl>
        <div><dt>Версия</dt><dd>{BUILD.version}</dd></div>
        <div><dt>Дата сборки</dt><dd>{BUILD.timestamp}</dd></div>
        <div><dt>Ветка</dt><dd>{BUILD.branch}</dd></div>
        <div><dt>Commit</dt><dd>{BUILD.commit}{BUILD.dirty ? '-dirty' : ''}</dd></div>
        <div><dt>Состояние</dt><dd>{BUILD.dirty ? 'Есть незакоммиченные изменения' : 'Чистая сборка'}</dd></div>
        {Object.entries(BUILD.features).map(([key, enabled]) => <div key={key}><dt>{key}</dt><dd>{String(enabled)}</dd></div>)}
      </dl>
    </section>
  );
}
