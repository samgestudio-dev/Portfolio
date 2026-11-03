/* The interface on the screen, in iPhone Air points (420 × 912, y down from the top).
   A general app, said as briefly as a skeleton can: rounded rectangles only, outlines
   for what contains, fills for what is held. Two levels of nesting:

     0 layout   what lies on the screen: the island, a title, a card, a list, the tab bar
     1 content  what the containers hold: the card's media, bars and button, the list's
                two rows, the tab bar's tabs

   A child always sits inside its parent, so the depth reads as containment. */

// g: [x0, y0, x1, y1, r] · fill: held content, painted lo
export const UI = [
  // layout
  { level: 0, g: [147, 12, 273, 49, 18.5], fill: true, name: 'island' },
  { level: 0, g: [26, 74, 214, 100, 13], fill: true, name: 'title' },
  { level: 0, g: [20, 122, 400, 472, 36], name: 'card' },
  { level: 0, g: [20, 492, 400, 724, 34], name: 'list' },
  { level: 0, g: [30, 800, 390, 874, 37], name: 'tab bar' },
  { level: 0, g: [140, 893, 280, 898, 2.5], fill: true, name: 'home' },

  // content
  { level: 1, g: [36, 138, 384, 332, 24], fill: true, name: 'media' },
  { level: 1, g: [40, 354, 262, 374, 10], fill: true, name: 'heading' },
  { level: 1, g: [40, 390, 200, 404, 7], fill: true, name: 'subtitle' },
  { level: 1, g: [270, 410, 384, 456, 23], fill: true, name: 'button', primary: true },
  { level: 1, g: [38, 512, 98, 572, 18], fill: true, name: 'thumb' },
  { level: 1, g: [118, 534, 330, 550, 8], fill: true, name: 'line' },
  { level: 1, g: [38, 644, 98, 704, 18], fill: true, name: 'thumb' },
  { level: 1, g: [118, 666, 296, 682, 8], fill: true, name: 'line' },
  { level: 1, g: [42, 812, 152, 862, 25], fill: true, name: 'tab' },
  { level: 1, g: [196, 832, 246, 842, 5], fill: true, name: 'tab' },
  { level: 1, g: [294, 832, 344, 842, 5], fill: true, name: 'tab' },
];

export const UI_LEVELS = ['layout', 'content'];
