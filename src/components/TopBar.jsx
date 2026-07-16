export default function TopBar({ photoCount }) {
  return (
    <header className="top-app-bar">
      <div>
        <p className="brand-mark">GPS Checker Map Photo</p>
        <h1>Проверка фотографий по координатам</h1>
      </div>
      <div className="top-app-bar-meta" aria-label="Количество выбранных фото">
        <span>{photoCount}</span>
        <small>фото</small>
      </div>
    </header>
  );
}
