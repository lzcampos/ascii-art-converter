const { asciiToImage, DEFAULT_ASCII_TO_IMAGE_OPTIONS } = require('./ascii-to-image');
const { imageToAscii } = require('./image-to-ascii');
const { DEFAULT_CHARSET, buildDensityRamp, getDensityMap, getDensityRamp } = require('./ramps');

module.exports = {
  asciiToImage,
  buildDensityRamp,
  DEFAULT_ASCII_TO_IMAGE_OPTIONS,
  DEFAULT_CHARSET,
  getDensityMap,
  getDensityRamp,
  imageToAscii,
};
