import './DashboardPilot.css';
import { Button as AntButton, Progress, Table, Tag } from 'antd';

const stages = ['Photos', 'Recognition', 'Map & points', 'Cleanup & upload', 'Result'];
const state = {
  session: 'Session 01', photos: 10, ready: 8, attention: 2, conflicts: 3, retries: 2,
};

function Mark({ children, tone = '' }) { return <Tag bordered className={`pilot-mark ${tone}`}>{children}</Tag>; }
function Button({ children, secondary = false }) { return <AntButton type={secondary ? 'default' : 'primary'} className={secondary ? 'pilot-button secondary' : 'pilot-button'}>{children}</AntButton>; }
function SharedFooter() { return <div className="pilot-footer"><span>LOCAL PROTOTYPE · SAMPLE DATA</span><span>Dashboard is summary / drill-down only</span></div>; }

function CommandDesk() {
  const rows = [
    ['IMG_1042', '47.1184, 39.7120', 'Ready', '12 m'],
    ['IMG_1043', '47.1188, 39.7116', 'Conflict', '8 m'],
    ['IMG_1044', '47.1191, 39.7109', 'Conflict', '31 m'],
    ['IMG_1045', '47.1198, 39.7107', 'Ready', '4 m'],
    ['IMG_1046', '—', 'Needs review', '—'],
  ];
  const columns = [
    { title: 'FILE', dataIndex: 'file', key: 'file', render: (value) => <span className="mono strong">{value}</span> },
    { title: 'COORDINATE', dataIndex: 'coordinate', key: 'coordinate', render: (value) => <span className="mono">{value}</span> },
    { title: 'STATE', dataIndex: 'state', key: 'state', render: (value) => <span><span className={`state-pill ${value === 'Ready' ? 'good' : value === 'Conflict' ? 'bad' : 'warn'}`} />{value}</span> },
    { title: 'AGE', dataIndex: 'age', key: 'age', render: (value) => <span className="muted mono">{value}</span> },
    { title: '', key: 'menu', render: () => <span className="row-menu">···</span> },
  ];
  const tableData = rows.map(([file, coordinate, stateName, age]) => ({ key: file, file, coordinate, state: stateName, age }));
  return <div className="pilot-shell command-shell">
    <aside className="command-rail"><div className="pilot-brand"><Mark tone="blue">DC</Mark><span>DARK CAT<br /><small>FIELD OPS</small></span></div><div className="rail-kicker">WORKSPACE</div><nav><a className="active">Overview <b>01</b></a><a>Sessions <b>04</b></a><a>Queue <b className="amber">05</b></a><a>Exports</a></nav><div className="rail-bottom"><span className="status-dot" /> Live local session<div className="operator">MK <span>Operator</span></div></div></aside>
    <main className="command-main"><header className="command-header"><div><p className="pilot-eyebrow">OPERATIONS / OVERVIEW</p><h1>Command desk</h1></div><div className="header-meta"><span className="mono">THU 20 AUG · 20:38</span><Button secondary>Export brief</Button><Button>Open session</Button></div></header>
      <section className="desk-strip"><div><span className="strip-label">ACTIVE SESSION</span><strong>{state.session}</strong><span className="muted">Field sweep / North route</span></div><div className="strip-stage"><span className="strip-label">CURRENT STAGE</span><strong><Mark tone="amber">03</Mark> Map &amp; points</strong><span className="muted">blocked · 3 conflicts</span></div><div className="desk-action"><Button>Resolve conflicts <span>→</span></Button></div></section>
      <section className="command-grid"><div className="table-panel"><div className="panel-heading"><div><p className="pilot-eyebrow">SESSION RADAR</p><h2>Photo queue <span>10 items</span></h2></div><span className="filter-chip">All states⌄</span></div><div className="queue-summary"><div><strong>{state.ready}</strong><span>ready</span></div><div className="amber-text"><strong>{state.attention}</strong><span>attention</span></div><div className="red-text"><strong>{state.conflicts}</strong><span>map conflicts</span></div></div><Table className="pilot-table" columns={columns} dataSource={tableData} pagination={false} size="small" /><div className="panel-foot">Showing 5 of 10 <a>View full queue →</a></div></div>
        <aside className="attention-panel"><div className="panel-heading"><div><p className="pilot-eyebrow">ATTENTION QUEUE</p><h2>5 actions</h2></div><Mark tone="red">LIVE</Mark></div><div className="attention-item critical"><div className="issue-icon">!</div><div><strong>3 map conflicts</strong><p>Points exceed route threshold</p><button>Inspect cluster →</button></div></div><div className="attention-item"><div className="issue-icon amber">↻</div><div><strong>2 upload retries</strong><p>Cleanup completed locally</p><button>Retry uploads →</button></div></div><div className="quick-actions"><span className="pilot-eyebrow">QUICK ACTIONS</span><button>Re-run recognition <b>R</b></button><button>Open processing journal <b>J</b></button></div></aside></section>
      <section className="command-progress"><div className="progress-copy"><p className="pilot-eyebrow">RUN PROGRESS</p><strong>Map &amp; points</strong><span>3 of 5 stages · 62% complete</span></div><Progress className="pilot-progress" percent={62} strokeColor="#6db8ff" trailColor="#293640" showInfo={false} /><div className="segmented-progress">{stages.map((s, i) => <div className={i < 2 ? 'done' : i === 2 ? 'current' : ''} key={s}><span>{String(i + 1).padStart(2, '0')}</span><label>{s}</label></div>)}</div></section><SharedFooter /></main>
  </div>;
}

function ProcessBoard() {
  const lanes = [
    { n: '01', title: 'Photos', status: 'complete', count: '10 / 10', card: '10 photos ingested', sub: '8 ready · 2 attention' },
    { n: '02', title: 'Recognition', status: 'complete', count: '10 / 10', card: 'Coordinates extracted', sub: 'OCR + EXIF pass complete' },
    { n: '03', title: 'Map & points', status: 'blocked', count: '7 / 10', card: 'Resolve 3 conflicts', sub: 'Required before cleanup', alert: true },
    { n: '04', title: 'Cleanup & upload', status: 'waiting', count: '0 / 10', card: 'Waiting on map points', sub: '2 retries queued' },
    { n: '05', title: 'Result', status: 'waiting', count: '—', card: 'Not started', sub: 'Export unlocks after upload' },
  ];
  return <div className="pilot-shell board-shell"><header className="board-top"><div className="pilot-brand"><Mark tone="blue">DC</Mark><span>DARK CAT <small>PROCESS BOARD</small></span></div><nav><a className="active">Run board</a><a>Activity</a><a>Rules</a></nav><div className="board-top-right"><span className="status-dot" /> LOCAL / CONNECTED <span className="avatar">MK</span></div></header><main className="board-main"><div className="board-title"><div><p className="pilot-eyebrow">SESSION 01 / FIELD SWEEP</p><h1>Make the next action obvious.</h1><p className="lede">A single view of the work moving through the photo pipeline.</p></div><div className="board-controls"><Button secondary>Activity log</Button><Button>Resume run →</Button></div></div><section className="board-status"><div><span className="strip-label">RUN STATUS</span><strong className="amber-text">Blocked at stage 03</strong></div><div className="status-line"><span className="line-fill" /><span className="line-rest" /></div><div className="status-note"><Mark tone="amber">NEXT</Mark><strong>Resolve map conflicts</strong><span>3 points need review</span></div></section><section className="lanes">{lanes.map((lane) => <article className={`lane ${lane.status}`} key={lane.n}><div className="lane-head"><span className="lane-number">{lane.n}</span><div><h2>{lane.title}</h2><span>{lane.count}</span></div><span className="lane-state">{lane.status}</span></div><div className={`lane-card ${lane.alert ? 'alert' : ''}`}><div className="lane-card-top"><span className="card-mark">{lane.status === 'complete' ? '✓' : lane.alert ? '!' : '·'}</span><span className="card-label">{lane.alert ? 'ACTION REQUIRED' : lane.status.toUpperCase()}</span></div><strong>{lane.card}</strong><p>{lane.sub}</p>{lane.alert && <Button>Open conflict list</Button>}</div>{lane.status === 'complete' && <div className="lane-foot">Validated · 20:31</div>}</article>)}</section><section className="board-bottom"><div><span className="pilot-eyebrow">SESSION INVENTORY</span><strong>10 photos</strong><span>8 ready / 2 need attention</span></div><div><span className="pilot-eyebrow">DEPENDENCIES</span><strong>1 active block</strong><span>Upload retries held until stage 03</span></div><div><span className="pilot-eyebrow">RECOVERY</span><strong>Local-first</strong><span>Nothing leaves browser before upload</span></div></section><SharedFooter /></main></div>;
}

function MapCockpit() {
  const points = [[24, 28], [39, 47], [53, 38], [67, 56], [74, 30], [83, 66], [31, 72]];
  return <div className="pilot-shell map-shell"><header className="map-top"><div className="pilot-brand"><Mark tone="blue">DC</Mark><span>DARK CAT <small>FIELD COCKPIT</small></span></div><div className="map-coords"><span className="live-puck" /> ROUTE 07 <span>47.1184° N · 39.7120° E</span></div><div className="map-tools"><button aria-label="Layers">◈</button><button aria-label="Search">⌕</button><span className="avatar">MK</span></div></header><main className="map-main"><div className="map-heading"><div><p className="pilot-eyebrow">SPATIAL REVIEW / SESSION 01</p><h1>Map &amp; points</h1></div><div className="map-legend"><span><i className="legend-dot blue" /> ready 8</span><span><i className="legend-dot red" /> conflict 3</span><span><i className="legend-dot amber" /> attention 2</span></div></div><section className="cockpit"><div className="mock-map"><div className="map-grid" /> <div className="map-water water-one" /><div className="map-water water-two" /><div className="route route-one" /><div className="route route-two" />{points.map((p, i) => <span key={i} className={`map-point ${i === 2 ? 'selected' : i === 1 || i === 5 ? 'conflict' : ''}`} style={{ left: `${p[0]}%`, top: `${p[1]}%` }}>{String(i + 1).padStart(2, '0')}</span>)}<div className="map-scale">N ↑<br /><span>0</span><span>250 m</span><span>500 m</span></div><div className="map-label label-a">NORTH ROUTE</div><div className="map-label label-b">FIELD 07</div></div><aside className="point-inspector"><div className="inspector-top"><span className="pilot-eyebrow">SELECTED POINT</span><Mark tone="red">CONFLICT</Mark></div><h2>Point 03 <span>IMG_1044</span></h2><div className="coordinate"><span className="pilot-eyebrow">COORDINATE</span><strong>47.1191, 39.7109</strong><span className="warning-line">↕ 31 m from route centroid</span></div><div className="inspector-section"><span className="pilot-eyebrow">WHY IT IS FLAGGED</span><p>Recognition and route position disagree beyond the 20 m threshold.</p></div><div className="inspector-section"><span className="pilot-eyebrow">RECOMMENDED ACTION</span><div className="recommend"><span>01</span><strong>Review point cluster</strong><p>Compare against adjacent points 02 and 04.</p></div></div><Button>Open point review →</Button><button className="quiet-link">Skip for now</button></aside></section><section className="map-bottom"><div className="map-stat"><strong>3</strong><span>conflicts on route</span></div><div className="map-stat"><strong>10</strong><span>photos plotted</span></div><div className="map-stat"><strong>2</strong><span>upload retries held</span></div><div className="map-next"><span className="pilot-eyebrow">NEXT ACTION</span><strong>Resolve map conflicts</strong><span>Stage 03 of 05 · blocking</span></div></section><SharedFooter /></main></div>;
}

export default function DashboardPilot() {
  const key = (new URLSearchParams(window.location.search).get('pilot') || window.location.pathname.split('/').pop()).toLowerCase();
  if (key === 'dashboard-b') return <ProcessBoard />;
  if (key === 'dashboard-c') return <MapCockpit />;
  return <CommandDesk />;
}
