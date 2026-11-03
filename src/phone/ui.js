/* The interface on the screen, in iPhone Air points (420 × 912, y down from the top).
   A skeleton of a general app, in rounded rectangles only: outlines for what contains,
   fills for the leaves. No pictures, no icons. Each element's level is its depth of
   nesting, and a child always sits inside its parent:

     0 surface     the screen
     1 containers  status items, header, search, card, two rows, tab bar
     2 content     what each container holds: bars, a media block, the button, tags, tabs
     3 detail      what the content holds: the button's label, a tag's label, a tab's label */

// g: [x0, y0, x1, y1, r] · fill: a skeleton leaf, painted lo
export const UI = [
  { level: 0, g: [0, 0, 420, 912, 62], name: 'surface' },

  // status bar
  { level: 1, g: [147, 12, 273, 49, 18.5], fill: true, name: 'island' },
  { level: 1, g: [46, 22, 98, 40, 9], fill: true, name: 'time' },
  { level: 1, g: [322, 22, 374, 40, 9], fill: true, name: 'status' },

  // header
  { level: 1, g: [20, 66, 400, 122, 28], name: 'header' },
  { level: 2, g: [42, 83, 220, 105, 11], fill: true, name: 'title' },
  { level: 2, g: [326, 80, 386, 108, 14], fill: true, name: 'action' },

  // search
  { level: 1, g: [20, 136, 400, 184, 24], name: 'search' },
  { level: 2, g: [44, 154, 220, 166, 6], fill: true, name: 'placeholder' },

  // card
  { level: 1, g: [20, 200, 400, 484, 34], name: 'card' },
  { level: 2, g: [34, 214, 386, 362, 22], fill: true, name: 'media' },
  { level: 2, g: [36, 380, 252, 400, 10], fill: true, name: 'heading' },
  { level: 2, g: [36, 412, 190, 426, 7], fill: true, name: 'subtitle' },
  { level: 2, g: [36, 444, 140, 456, 6], fill: true, name: 'meta' },
  { level: 2, g: [268, 412, 386, 466, 27], name: 'button', primary: true },
  { level: 3, g: [296, 433, 358, 445, 6], fill: true, name: 'label' },

  // three rows
  ...[500, 596, 692].flatMap((y, i) => [
    { level: 1, g: [20, y, 400, y + 84, 28], name: 'row' },
    { level: 2, g: [34, y + 14, 90, y + 70, 17], fill: true, name: 'thumb' },
    { level: 2, g: [106, y + 24, [262, 236, 248][i], y + 38, 7], fill: true, name: 'line' },
    { level: 2, g: [106, y + 48, [206, 228, 186][i], y + 60, 6], fill: true, name: 'line' },
    { level: 2, g: [318, y + 28, 386, y + 56, 14], name: 'tag' },
    { level: 3, g: [334, y + 37, 370, y + 47, 5], fill: true, name: 'label' },
  ]),

  // floating tab bar and the home indicator
  { level: 1, g: [30, 800, 390, 874, 37], name: 'tabs' },
  { level: 2, g: [40, 810, 160, 864, 27], name: 'tab' },
  { level: 3, g: [70, 832, 130, 842, 5], fill: true, name: 'label' },
  { level: 2, g: [190, 832, 240, 842, 5], fill: true, name: 'label' },
  { level: 2, g: [270, 832, 320, 842, 5], fill: true, name: 'label' },
  { level: 2, g: [330, 832, 370, 842, 5], fill: true, name: 'label' },
  { level: 1, g: [140, 893, 280, 898, 2.5], fill: true, name: 'home' },
];

export const UI_LEVELS = ['surface', 'containers', 'content', 'detail'];
