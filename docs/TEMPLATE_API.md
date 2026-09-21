# Контракт шаблона конструктора

Шаблон — это обычный JS-файл `src/templates/<id>.js`. Он регистрирует объект в `window.Templates[<id>]`.
Страница `constructor.html` строит форму по `schema` шаблона, собирает SVG через `generate()`
и отдаёт его в `SvgEngine` для экспорта. Шаблон ничего не знает про DOM формы.

```js
window.Templates.<id> = {
  id: '<id>',
  title: 'Название в выпадающем списке',

  // --- ассеты
  assetDir: 'assets/<id>/',                 // откуда брать встроенные картинки
  builtinImages: ['u1.png', ...],           // имена встроенных картинок персонажа
  emotionNames: { 'u1.png': 'хитрый взгляд', ... },
  fonts: { unbounded: 'assets/fonts/unbounded-800.woff2', ... },   // страница загрузит их в ctx.fonts[name] (base64)
  metrics: 'assets/fonts/metrics.json',     // страница загрузит JSON в ctx.metrics: { <fontName>: { upm, adv: { codepoint: advance } } }
  extraAssets: { logo: 'assets/<id>/logo.svg' },   // необязательно: страница загрузит ТЕКСТ этих файлов в ctx.assets[name]
  wideViewBox: [x, y, w, h],                // область, где гарантированно помещается вся анимация (для замера и обрезки холста)

  defaults(): config,                       // полный config по умолчанию; config.scenes — массив сцен, у каждой есть type

  // Картинки персонажа. Страница сама: загружает, вырезает зелёный фон, обрезает по непрозрачному
  // (низ не трогает), зеркалит и масштабирует. Параметры для этого шаблон отдаёт тут:
  imageOptions(config, name) -> { scale: number, mirror: boolean },
  usedImages(config) -> ['u1.png', ...],     // какие картинки реально нужны generate()

  // Сборка. Бросает Error с понятным русским текстом при ошибке конфигурации.
  generate(config, ctx) -> { svg: string, duration: number, width, height, viewBox: [x,y,w,h], warnings: string[] },
  //   ctx = { fonts: { name: base64woff2 }, metrics, images: { name: { w, h, dataUrl } }, assets: { name: text } }
  //   config.viewBox (если задан) — использовать как viewBox/width/height итогового SVG.

  schema: {
    sections: [                              // секции формы, кроме «Сцены» и «Картинки»
      { title: 'Промокод и сайт', open: true, fields: [ Field, ... ] },
      ...
    ],
    colors: { path: 'colors', labels: { key: 'Подпись' } },   // объект цветов в config -> секция «Цвета» с color-пикерами
    sceneTypes: { big: 'Крупный текст', ... },
    sceneFields: { big: [ Field, ... ], ... },               // поля конкретного типа сцены (duration/emotion тоже сюда)
    newScene: { big: () => ({ type: 'big', ... }), ... },
    sceneTitle(scene) -> 'короткая подпись для чипа таймлайна'   // необязательно
  }
};
```

`Field`:

```js
{ path: 'promo_code', label: 'Промокод', kind: 'text', placeholder: '...' }
{ path: 'duration', label: 'Длительность, с', kind: 'number', min: 2.5, max: 20, step: 0.5 }
{ path: 'emotion', label: 'Картинка персонажа', kind: 'image' }             // выпадающий список встроенных + загруженных
{ path: 'react.emotion', label: 'Сменить эмоцию на', kind: 'image', optional: 'react' }  // пустое значение удаляет объект react
{ path: 'reaction', label: 'Реакция', kind: 'select', options: { none: 'нет', hearts: 'сердечки' } }
{ path: 'character.mirror', label: 'Отзеркалить', kind: 'check' }
{ path: 'ribbons.front.words', label: 'Слова ленты', kind: 'list' }          // массив строк <-> «через запятую»
{ path: 'character.glow', label: 'Свечение', kind: 'color-name' }           // выбор имени цвета из schema.colors
{ path: 'lines.0', ... }                                                     // индексы массивов в пути разрешены
{ ..., hint: 'пояснение под полем', half: true }                             // half — поле в половину ширины
{ ..., showIf: scene => !!scene.react }                                      // показывать поле только при условии
```

Путь `path` в `sections` отсчитывается от корня config, в `sceneFields` — от объекта сцены.
Разметка цветного текста `{слово}` / `{слово|цвет}` — забота шаблона (подсказку пиши в `hint`).
