# SVG → WebM Pages

Статичный редактор для GitHub Pages + локальный экспортёр для качественного transparent WebM.

## Что внутри

- `index.html` — страница для GitHub Pages: вставка SVG, живое превью с авторазмером, быстрый браузерный WebM и превью результата.
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

Кнопка **Быстрый экспорт WebM** работает прямо в браузере через `canvas.captureStream()` + `MediaRecorder`.

Плюсы:

- работает на GitHub Pages;
- ничего не нужно устанавливать;
- после экспорта появляется встроенное превью WebM на шахматке/чёрном/белом фоне.

Минусы:

- alpha-канал зависит от браузера;
- качество краёв хуже, чем у ffmpeg;
- сложные CSS-анимации лучше экспортировать локально.

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
npm run export:svg -- my.svg output.webm --duration=5 --fps=60 --strip-bg --scale=2 --crf=10
```

После экспорта рядом появится:

```text
output.preview.html
```

Открой его в браузере — там можно проверить прозрачность WebM на шахматке, чёрном и белом фоне.

## Почему лучше `--duration=5`, а не `--duration 5`

Оба варианта поддерживаются, но `--duration=5` надёжнее в разных терминалах и версиях npm, особенно на Windows/PowerShell.

## Качество краёв

Transparent WebM почти всегда упирается в ограничения VP9/WebM alpha. Что помогает:

```bash
npm run export:svg -- my.svg output.webm --duration=5 --fps=60 --strip-bg --scale=2 --crf=10
```

Ещё лучше:

```bash
npm run export:svg -- my.svg output.webm --duration=5 --fps=60 --strip-bg --scale=3 --crf=8
```

Максимально чисто, но большие файлы:

```bash
npm run export:svg -- my.svg output.webm --duration=5 --fps=60 --strip-bg --scale=2 --lossless
```

Если нужен WebM именно 800×240, но с более аккуратным ресемплингом:

```bash
npm run export:svg -- my.svg output.webm --duration=5 --fps=60 --strip-bg --scale=3 --downscale --crf=8
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

Лучше всего работает один корневой `<svg>...</svg>` без внешних ссылок. Inline SMIL-анимации вроде `<animate>` и `<animateTransform>` поддерживаются локальным экспортом через браузерный рендеринг.
