# SVG → WebM Pages

Статичный редактор для GitHub Pages + локальный экспортёр для качественного transparent WebM.

## Что внутри

- `index.html` — страница для GitHub Pages: вставка SVG, живое превью с авторазмером, быстрый браузерный WebM, поддержка SMIL и CSS keyframes через live snapshot, авто-длительность, превью результата.
- `export-node/export-svg.js` — качественный локальный экспорт через Puppeteer + ffmpeg.
- `examples/` — SVG/HTML примеры.

## Запуск сайта локально

Не открывай `index.html` двойным кликом через `file://`. Запускай через локальный сервер:

```bash
python -m http.server 5173
```

Открой:

```text
http://localhost:5173/
```

## GitHub Pages

Загрузи содержимое папки в репозиторий и включи:

```text
Settings → Pages → Deploy from a branch → main → /root
```

## Авторазмер превью

Страница читает `width`/`height` или `viewBox` из корневого `<svg>` и подстраивает блок живого превью под реальные пропорции SVG. Если у SVG нет `viewBox`, он добавляется для превью автоматически, чтобы картинка нормально масштабировалась внутри блока.

## Быстрый браузерный экспорт

Кнопка **Быстрый экспорт WebM** работает прямо в браузере через `canvas.captureStream()` + `MediaRecorder`. Начиная с v7, сервис автоматически определяет длительность из SMIL/CSS и пишет браузерный WebM в реальном времени. Перед каждым кадром он держит SVG в скрытом live-iframe, выставляет нужное время SMIL/CSS-анимаций и делает snapshot текущих computed styles. В v6 тяжёлые SVG могли давать замедленный WebM, потому что кадры рендерились последовательно. В v7, если браузер не успевает, кадры пропускаются, но итоговая скорость видео остаётся правильной. Поэтому SVG с `@keyframes`, `animation`, `<animate>` и `<animateTransform>` теперь рендерятся заметно надёжнее.

Плюсы:

- работает на GitHub Pages;
- ничего не нужно устанавливать;
- после экспорта появляется встроенное превью WebM на шахматке/чёрном/белом фоне.

Минусы:

- alpha-канал зависит от браузера;
- качество краёв хуже, чем у ffmpeg;
- очень сложные CSS/SVG-фильтры могут пропускать кадры в браузере, если компьютер не успевает; для финала лучше локальный Puppeteer + ffmpeg;

Для более ровных границ в браузере поставь **Масштаб записи = 2** или **3**. WebM получится больше размером, но при отображении меньшим CSS-размером края будут чище.

## Качественный transparent WebM

Установи зависимости:

```bash
npm install
```

Проверь, что `ffmpeg` установлен и доступен из терминала:

```bash
ffmpeg -version
```

Экспорт примера:

```bash
npm run export:example
```

Экспорт своего SVG:

```bash
npm run export:svg -- my.svg output.webm --fps=60 --strip-bg --scale=2 --crf=10
```

После экспорта рядом появится:

```text
output.preview.html
```

Открой его в браузере — там можно проверить прозрачность WebM на шахматке, чёрном и белом фоне.

## Авто-длительность

В веб-версии включена галка **Авто-длительность из SVG/CSS**. Она смотрит `<animate dur="...">`, `<animateTransform dur="...">`, `animation: ... 12s ...` и `animation-duration: ...`, а затем берёт доминирующую длительность. Это специально сделано для SVG, где основной сценарий 12s, но есть мелкие jitter-анимации и длинные фоновые градиенты.

В локальном экспортёре `--duration` можно вообще не указывать — длительность тоже определяется автоматически. Если надо вручную, используй формат с `=`:

```bash
npm run export:svg -- my.svg output.webm --duration=12 --fps=60 --strip-bg --scale=2 --crf=10
```

## Качество краёв

Transparent WebM почти всегда упирается в ограничения VP9/WebM alpha. Что помогает:

```bash
npm run export:svg -- my.svg output.webm --fps=60 --strip-bg --scale=2 --crf=10
```

Ещё лучше:

```bash
npm run export:svg -- my.svg output.webm --fps=60 --strip-bg --scale=3 --crf=8
```

Максимально чисто, но большие файлы:

```bash
npm run export:svg -- my.svg output.webm --fps=60 --strip-bg --scale=2 --lossless
```

Если нужен WebM именно 800×240, но с более аккуратным ресемплингом:

```bash
npm run export:svg -- my.svg output.webm --fps=60 --strip-bg --scale=3 --downscale --crf=8
```

На практике самый чистый вариант — экспортировать 2× или 3× и показывать видео меньшим CSS-размером:

```html
<video src="output.webm" style="width:800px;height:240px" autoplay loop muted playsinline></video>
```

## Удаление фона

Если в SVG есть фон:

```svg
<rect width="800" height="240" fill="#0f172a"/>
```

то это настоящий непрозрачный фон. Для transparent WebM его нужно убрать. Опция `--strip-bg` удаляет первый root-level `<rect>`, если он похож на фон.

## Формат SVG

Лучше всего работает один корневой `<svg>...</svg>` без внешних ссылок. Поддерживаются inline SMIL-анимации вроде `<animate>`/`<animateTransform>` и CSS-анимации через `<style>@keyframes...</style>`. В примерах есть `examples/yakoo_pnv_animated_banner_smooth_intro.svg` — тяжёлый CSS/SMIL SVG для проверки.
