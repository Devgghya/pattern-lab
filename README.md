# Pattern Lab

Pattern Lab V2 is an installation-first p5.js graphic-design instrument that
transforms a live webcam feed or uploaded images into square, pattern-based artwork.

## Features

- Live, mirrored webcam processing with a camera selector
- One-click installation start and fullscreen display mode
- Upload any image as an alternative input
- Six mark styles: lines, circles, squares, crosses, diamonds, and arcs
- Live size, scale, rotation, direction, contrast, threshold, and colour controls
- Controls stay hidden until the settings button or `G` key is used
- Freeze/resume the live image and automatically hide settings after inactivity
- Complete keyboard workflow — press `?` in the app
- Square JPEG and SVG exports
- Responsive interface for desktop and mobile

Camera frames are processed locally in the browser and are never uploaded.

## Development

```bash
npm install
npm run dev
```

The production site is deployed automatically to GitHub Pages from `main`.
