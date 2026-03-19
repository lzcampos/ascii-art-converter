const { createCanvas } = require('canvas');

const DEFAULT_CHARSET = ' .,-+=1ITVYXRGBM@#&8W$';

const rampCache = new Map();
const densityMapCache = new Map();

function buildDensityRamp(chars, fontSize = 16) {
  const canvas = createCanvas(fontSize, fontSize * 2);
  const context = canvas.getContext('2d');

  context.font = `${fontSize}px monospace`;
  context.textBaseline = 'top';

  const densities = chars.split('').map((character) => {
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'black';
    context.fillText(character, 0, 0);

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let darkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      darkPixels += (255 - data[i]) / 255;
    }

    return { character, density: darkPixels };
  });

  densities.sort((left, right) => left.density - right.density);

  const unique = [densities[0]];
  for (let i = 1; i < densities.length; i++) {
    if (densities[i].density > unique[unique.length - 1].density + 0.5) {
      unique.push(densities[i]);
    }
  }

  return unique.map((item) => item.character).join('');
}

function getDensityRamp(chars = DEFAULT_CHARSET, fontSize = 16) {
  const key = `${chars}::${fontSize}`;

  if (!rampCache.has(key)) {
    rampCache.set(key, buildDensityRamp(chars, fontSize));
  }

  return rampCache.get(key);
}

function getDensityMap(chars = DEFAULT_CHARSET, fontSize = 16) {
  const key = `${chars}::${fontSize}`;

  if (!densityMapCache.has(key)) {
    const ramp = getDensityRamp(chars, fontSize);
    const densityMap = new Map();
    const denominator = Math.max(1, ramp.length - 1);

    for (let i = 0; i < ramp.length; i++) {
      densityMap.set(ramp[i], i / denominator);
    }

    densityMapCache.set(key, densityMap);
  }

  return densityMapCache.get(key);
}

module.exports = {
  DEFAULT_CHARSET,
  buildDensityRamp,
  getDensityMap,
  getDensityRamp,
};
