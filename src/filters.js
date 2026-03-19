function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function buildGaussianKernel(radius, sigma = Math.max(radius / 2, 1)) {
  if (radius <= 0) {
    return Float64Array.of(1);
  }

  const size = radius * 2 + 1;
  const kernel = new Float64Array(size);
  let sum = 0;

  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }

  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }

  return kernel;
}

function buildGaussianKernelFromSigma(sigma) {
  if (sigma <= 0) {
    return Float64Array.of(1);
  }

  const radius = Math.max(1, Math.ceil(sigma * 3));
  return buildGaussianKernel(radius, sigma);
}

function applyHorizontalKernel(pixels, width, height, kernel) {
  const radius = Math.floor(kernel.length / 2);
  const output = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(width - 1, Math.max(0, x + k));
        value += pixels[y * width + sx] * kernel[k + radius];
      }
      output[y * width + x] = value;
    }
  }

  return output;
}

function applyVerticalKernel(pixels, width, height, kernel) {
  const radius = Math.floor(kernel.length / 2);
  const output = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(height - 1, Math.max(0, y + k));
        value += pixels[sy * width + x] * kernel[k + radius];
      }
      output[y * width + x] = value;
    }
  }

  return output;
}

function blurHorizontal(pixels, width, height, radius) {
  if (radius <= 0) {
    return pixels;
  }

  pixels.set(applyHorizontalKernel(pixels, width, height, buildGaussianKernel(radius)));
  return pixels;
}

function blurVertical(pixels, width, height, radius) {
  if (radius <= 0) {
    return pixels;
  }

  pixels.set(applyVerticalKernel(pixels, width, height, buildGaussianKernel(radius)));
  return pixels;
}

function blurGaussian(pixels, width, height, sigma) {
  if (sigma <= 0) {
    return pixels;
  }

  const kernel = buildGaussianKernelFromSigma(sigma);
  const horizontal = applyHorizontalKernel(pixels, width, height, kernel);
  const vertical = applyVerticalKernel(horizontal, width, height, kernel);
  pixels.set(vertical);
  return pixels;
}

function bilateralFilter(pixels, width, height, spatialSigma, rangeSigma) {
  if (spatialSigma <= 0 || rangeSigma <= 0) {
    return pixels;
  }

  const radius = Math.max(1, Math.ceil(spatialSigma * 2));
  const output = new Float64Array(pixels.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = pixels[y * width + x];
      let weightedSum = 0;
      let weightSum = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const value = pixels[ny * width + nx];
          const spatialDistance = (dx * dx + dy * dy) / (2 * spatialSigma * spatialSigma);
          const rangeDistance = (value - center) * (value - center) / (2 * rangeSigma * rangeSigma);
          const weight = Math.exp(-spatialDistance - rangeDistance);

          weightedSum += value * weight;
          weightSum += weight;
        }
      }

      output[y * width + x] = weightSum === 0 ? center : weightedSum / weightSum;
    }
  }

  pixels.set(output);
  return pixels;
}

function cubicWeight(t) {
  const a = -0.5;
  const absT = Math.abs(t);

  if (absT <= 1) {
    return (a + 2) * absT * absT * absT - (a + 3) * absT * absT + 1;
  }

  if (absT <= 2) {
    return a * absT * absT * absT - 5 * a * absT * absT + 8 * a * absT - 4 * a;
  }

  return 0;
}

function bicubicUpscale(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const target = new Float64Array(targetWidth * targetHeight);

  for (let targetY = 0; targetY < targetHeight; targetY++) {
    const sourceY = (targetY + 0.5) * sourceHeight / targetHeight - 0.5;
    const iy = Math.floor(sourceY);
    const fy = sourceY - iy;

    for (let targetX = 0; targetX < targetWidth; targetX++) {
      const sourceX = (targetX + 0.5) * sourceWidth / targetWidth - 0.5;
      const ix = Math.floor(sourceX);
      const fx = sourceX - ix;

      let value = 0;
      for (let yOffset = -1; yOffset <= 2; yOffset++) {
        const wy = cubicWeight(fy - yOffset);
        const sy = Math.min(sourceHeight - 1, Math.max(0, iy + yOffset));

        for (let xOffset = -1; xOffset <= 2; xOffset++) {
          const wx = cubicWeight(fx - xOffset);
          const sx = Math.min(sourceWidth - 1, Math.max(0, ix + xOffset));
          value += source[sy * sourceWidth + sx] * wx * wy;
        }
      }

      target[targetY * targetWidth + targetX] = clamp01(value);
    }
  }

  return target;
}

function enhanceDetail(pixels, width, height, options = {}) {
  const {
    smoothSigma = 5,
    detailThreshold = 0.02,
    detailAmount = 2,
  } = options;

  if (smoothSigma <= 0 || detailAmount <= 0) {
    return pixels;
  }

  const smooth = Float64Array.from(pixels);
  blurGaussian(smooth, width, height, smoothSigma);

  for (let i = 0; i < pixels.length; i++) {
    const detail = pixels[i] - smooth[i];
    const normalizedDetail = Math.abs(detail) / Math.max(detailThreshold, 1e-6);
    const gate = normalizedDetail * normalizedDetail / (1 + normalizedDetail * normalizedDetail);
    pixels[i] = clamp01(smooth[i] + detail * gate * detailAmount);
  }

  return pixels;
}

module.exports = {
  bilateralFilter,
  bicubicUpscale,
  blurGaussian,
  blurHorizontal,
  blurVertical,
  clamp01,
  enhanceDetail,
};
