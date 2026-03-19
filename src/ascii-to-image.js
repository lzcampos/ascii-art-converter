const { createCanvas } = require('canvas');
const {
  bilateralFilter,
  bicubicUpscale,
  blurGaussian,
  blurHorizontal,
  blurVertical,
  clamp01,
  enhanceDetail,
} = require('./filters');
const { DEFAULT_CHARSET, getDensityMap } = require('./ramps');

const DEFAULT_ASCII_TO_IMAGE_OPTIONS = {
  scale: 10,
  width: undefined,
  height: undefined,
  invert: false,
  charAspect: 0.5,
  chars: DEFAULT_CHARSET,
  horizontalBlur: 5,
  verticalBlur: 1,
  bilateralPasses: 1,
  bilateralSpatialSigma: 1.5,
  bilateralRangeSigma: 0.1,
  contrastLow: 0.01,
  contrastHigh: 0.99,
  gamma: 0.9,
  upscaleBlur: 2,
  detailBlur: 5,
  detailThreshold: 0.02,
  detailAmount: 2.4,
  format: 'png',
  jpegQuality: 0.92,
};

function normalizeAsciiLines(ascii) {
  return ascii
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.length > 0);
}

function normalizeCharacterSet(chars) {
  return typeof chars === 'string' && chars.length > 0 ? chars : DEFAULT_CHARSET;
}

function normalizeContrast(pixels, low, high, gamma) {
  const sorted = Float64Array.from(pixels).sort();
  const lowIndex = Math.floor(sorted.length * low);
  const highIndex = Math.floor(sorted.length * high);
  const minValue = sorted[Math.max(0, Math.min(sorted.length - 1, lowIndex))];
  const maxValue = sorted[Math.max(0, Math.min(sorted.length - 1, highIndex))];
  const range = Math.max(maxValue - minValue, 1e-6);

  for (let i = 0; i < pixels.length; i++) {
    const normalized = clamp01((pixels[i] - minValue) / range);
    pixels[i] = Math.pow(normalized, gamma);
  }
}

function resolveOutputSize(cols, rows, options) {
  const defaultWidth = Math.max(1, Math.round(cols * options.scale));
  const defaultHeight = Math.max(1, Math.round(rows * options.scale / options.charAspect));
  const aspectRatio = defaultWidth / defaultHeight;
  const hasWidth = Number.isFinite(options.width) && options.width > 0;
  const hasHeight = Number.isFinite(options.height) && options.height > 0;

  if (hasWidth && hasHeight) {
    return {
      width: Math.max(1, Math.round(options.width)),
      height: Math.max(1, Math.round(options.height)),
    };
  }

  if (hasWidth) {
    const width = Math.max(1, Math.round(options.width));
    return {
      width,
      height: Math.max(1, Math.round(width / aspectRatio)),
    };
  }

  if (hasHeight) {
    const height = Math.max(1, Math.round(options.height));
    return {
      width: Math.max(1, Math.round(height * aspectRatio)),
      height,
    };
  }

  return {
    width: defaultWidth,
    height: defaultHeight,
  };
}

function buildGrid(ascii, options) {
  const lines = normalizeAsciiLines(ascii);

  if (lines.length === 0) {
    throw new Error('ASCII input is empty.');
  }

  const cols = Math.max(...lines.map((line) => line.length));
  const rows = lines.length;
  const densityMap = getDensityMap(normalizeCharacterSet(options.chars));
  const grid = new Float64Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const character = col < lines[row].length ? lines[row][col] : ' ';
      const darkness = densityMap.has(character) ? densityMap.get(character) : 0;
      grid[row * cols + col] = options.invert ? 1 - darkness : darkness;
    }
  }

  return { grid, cols, rows };
}

function applySmoothing(grid, cols, rows, options) {
  blurHorizontal(grid, cols, rows, Math.max(0, Math.round(options.horizontalBlur)));
  blurVertical(grid, cols, rows, Math.max(0, Math.round(options.verticalBlur)));

  for (let i = 0; i < Math.max(0, Math.round(options.bilateralPasses)); i++) {
    bilateralFilter(
      grid,
      cols,
      rows,
      options.bilateralSpatialSigma,
      options.bilateralRangeSigma
    );
  }

  normalizeContrast(grid, cols ? options.contrastLow : 0, cols ? options.contrastHigh : 1, options.gamma);
}

function renderPixelsToBuffer(pixels, width, height, options) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(width, height);

  for (let i = 0; i < pixels.length; i++) {
    const value = Math.round(clamp01(1 - pixels[i]) * 255);
    imageData.data[i * 4] = value;
    imageData.data[i * 4 + 1] = value;
    imageData.data[i * 4 + 2] = value;
    imageData.data[i * 4 + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);

  if (options.format === 'jpeg' || options.format === 'jpg') {
    return canvas.toBuffer('image/jpeg', { quality: options.jpegQuality });
  }

  return canvas.toBuffer('image/png');
}

function asciiToImage(ascii, options = {}) {
  const resolvedOptions = {
    ...DEFAULT_ASCII_TO_IMAGE_OPTIONS,
    ...options,
  };

  if (typeof ascii !== 'string') {
    throw new Error('ASCII input must be a string.');
  }

  if (!Number.isFinite(resolvedOptions.scale) || resolvedOptions.scale <= 0) {
    throw new Error('`scale` must be a positive number.');
  }

  if (resolvedOptions.width !== undefined && (!Number.isFinite(resolvedOptions.width) || resolvedOptions.width <= 0)) {
    throw new Error('`width` must be a positive number when provided.');
  }

  if (resolvedOptions.height !== undefined && (!Number.isFinite(resolvedOptions.height) || resolvedOptions.height <= 0)) {
    throw new Error('`height` must be a positive number when provided.');
  }

  if (!Number.isFinite(resolvedOptions.charAspect) || resolvedOptions.charAspect <= 0) {
    throw new Error('`charAspect` must be a positive number.');
  }

  if (
    !Number.isFinite(resolvedOptions.contrastLow) ||
    !Number.isFinite(resolvedOptions.contrastHigh) ||
    resolvedOptions.contrastLow < 0 ||
    resolvedOptions.contrastHigh > 1 ||
    resolvedOptions.contrastLow >= resolvedOptions.contrastHigh
  ) {
    throw new Error('`contrastLow` and `contrastHigh` must be between 0 and 1, with low < high.');
  }

  const { grid, cols, rows } = buildGrid(ascii, resolvedOptions);
  applySmoothing(grid, cols, rows, resolvedOptions);

  const { width, height } = resolveOutputSize(cols, rows, resolvedOptions);
  const pixels = bicubicUpscale(grid, cols, rows, width, height);

  blurGaussian(pixels, width, height, resolvedOptions.upscaleBlur);
  enhanceDetail(pixels, width, height, {
    smoothSigma: resolvedOptions.detailBlur,
    detailThreshold: resolvedOptions.detailThreshold,
    detailAmount: resolvedOptions.detailAmount,
  });

  return renderPixelsToBuffer(pixels, width, height, resolvedOptions);
}

module.exports = {
  asciiToImage,
  DEFAULT_ASCII_TO_IMAGE_OPTIONS,
};
