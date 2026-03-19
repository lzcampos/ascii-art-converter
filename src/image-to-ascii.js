const { createCanvas, loadImage } = require('canvas');
const { DEFAULT_CHARSET, getDensityRamp } = require('./ramps');

function normalizeCharacterSet(chars) {
  return typeof chars === 'string' && chars.length > 0 ? chars : DEFAULT_CHARSET;
}

function getBrightness(data, offset) {
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

function inferDefaultCols(imageWidth) {
  return Math.max(80, Math.min(200, Math.round(imageWidth / 2)));
}

async function imageToAscii(input, options = {}) {
  const {
    cols,
    charAspect = 0.5,
    chars = DEFAULT_CHARSET,
  } = options;

  if (!input) {
    throw new Error('An input image path or buffer is required.');
  }

  if (cols !== undefined && (!Number.isFinite(cols) || cols <= 0)) {
    throw new Error('`cols` must be a positive number.');
  }

  if (!Number.isFinite(charAspect) || charAspect <= 0) {
    throw new Error('`charAspect` must be a positive number.');
  }

  const image = await loadImage(input);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);

  const { data } = context.getImageData(0, 0, image.width, image.height);
  const width = Math.max(1, Math.round(cols ?? inferDefaultCols(image.width)));
  const cellWidth = image.width / width;
  const cellHeight = cellWidth / charAspect;
  const rows = Math.max(1, Math.floor(image.height / cellHeight));
  const densityRamp = getDensityRamp(normalizeCharacterSet(chars));

  const lines = [];
  for (let row = 0; row < rows; row++) {
    let line = '';

    for (let col = 0; col < width; col++) {
      const x0 = Math.min(image.width - 1, Math.floor(col * cellWidth));
      const y0 = Math.min(image.height - 1, Math.floor(row * cellHeight));
      const x1 = Math.min(image.width, Math.max(x0 + 1, Math.floor((col + 1) * cellWidth)));
      const y1 = Math.min(image.height, Math.max(y0 + 1, Math.floor((row + 1) * cellHeight)));

      let sum = 0;
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += getBrightness(data, (y * image.width + x) * 4);
          count++;
        }
      }

      const brightness = count === 0 ? 1 : sum / count / 255;
      const index = Math.round((1 - brightness) * (densityRamp.length - 1));
      line += densityRamp[index];
    }

    lines.push(line);
  }

  return lines.join('\n');
}

module.exports = {
  imageToAscii,
};
