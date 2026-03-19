#!/usr/bin/env node

const path = require('path');
const { loadImage } = require('canvas');
const pkg = require('../package.json');
const { asciiToImage, DEFAULT_ASCII_TO_IMAGE_OPTIONS, imageToAscii } = require('../src');
const { readAsciiFile, writeBinaryFile, writeTextFile } = require('../src/io');

function printHelp(command) {
  const common = [
    'Usage:',
    '  ascii-art-converter img2txt <input> [-o output.txt] [--cols 120] [--char-aspect 0.5] [--chars "..."] [--stdout] [--force]',
    '  ascii-art-converter txt2img <input.txt> [-o output.png] [--scale 10] [--width 800] [--height 600] [--char-aspect 0.5] [--format png] [--force]',
    '  ascii-art-converter roundtrip <input-image> [--txt-out output.txt] [--img-out output.png] [--cols 120] [--force]',
    '',
    'Commands:',
    '  img2txt    Convert an image into ASCII text.',
    '  txt2img    Render ASCII text into a smoothed grayscale image.',
    '  roundtrip  Generate both ASCII text and a rendered image from an input image.',
    '',
    'Global flags:',
    '  --help       Show help.',
    '  --version    Show package version.',
  ];

  const byCommand = {
    img2txt: [
      'Options for img2txt:',
      '  -o, --output <file>       Write ASCII to a file instead of stdout.',
      '  --cols <number>           Number of columns to sample. Default: auto (80-200 based on input width).',
      '  --char-aspect <number>    Character width/height ratio. Default: 0.5.',
      '  --chars <string>          Character set used to build the density ramp.',
      '  --stdout                  Force ASCII output to stdout.',
      '  --force                   Overwrite output file if it exists.',
    ],
    txt2img: [
      'Options for txt2img:',
      '  -o, --output <file>                 Output image path. Defaults to input basename + extension.',
      '  --scale <number>                    Pixels per character. Default: 10.',
      '  --width <number>                    Explicit output width in pixels.',
      '  --height <number>                   Explicit output height in pixels.',
      '  --char-aspect <number>              Character width/height ratio. Default: 0.5.',
      '  --invert                            Invert light/dark mapping.',
      '  --chars <string>                    Character set used to build the density ramp.',
      '  --format <png|jpeg>                 Output image format. Default: png.',
      '  --jpeg-quality <0-1>                JPEG quality. Default: 0.92.',
      '  --horizontal-blur <number>          Grid horizontal blur radius.',
      '  --vertical-blur <number>            Grid vertical blur radius.',
      '  --bilateral-passes <number>         Bilateral smoothing passes.',
      '  --bilateral-spatial-sigma <number>  Bilateral spatial sigma.',
      '  --bilateral-range-sigma <number>    Bilateral range sigma.',
      '  --contrast-low <0-1>                Lower contrast percentile.',
      '  --contrast-high <0-1>               Upper contrast percentile.',
      '  --gamma <number>                    Gamma adjustment.',
      '  --upscale-blur <number>             Post-upscale Gaussian blur sigma.',
      '  --detail-blur <number>              Detail smoothing sigma.',
      '  --detail-threshold <number>         Detail enhancement threshold.',
      '  --detail-amount <number>            Detail enhancement strength.',
      '  --force                             Overwrite output file if it exists.',
    ],
    roundtrip: [
      'Options for roundtrip:',
      '  --txt-out <file>          Output ASCII file path. Defaults to input basename + .txt.',
      '  --img-out <file>          Output image path. Defaults to input basename + extension.',
      '  --cols <number>           Number of columns for the image-to-text step. Default: auto (80-200 based on input width).',
      '  --scale <number>          Override the default size-matching behavior with pixels per character.',
      '  --width <number>          Explicit output width in pixels.',
      '  --height <number>         Explicit output height in pixels.',
      '  --char-aspect <number>    Shared character aspect ratio. Default: 0.5.',
      '  --chars <string>          Character set used to build the density ramp.',
      '  --invert                  Invert light/dark mapping for the text-to-image step.',
      '  --format <png|jpeg>       Output image format. Default: png.',
      '  --force                   Overwrite output files if they exist.',
    ],
  };

  const lines = command && byCommand[command]
    ? common.concat([''], byCommand[command])
    : common.concat([''], byCommand.img2txt, [''], byCommand.txt2img, [''], byCommand.roundtrip);

  console.log(lines.join('\n'));
}

function parseArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const [rawKey, inlineValue] = arg.slice(2).split('=');
      if (inlineValue !== undefined) {
        flags[rawKey] = inlineValue;
        continue;
      }

      const next = argv[index + 1];
      if (next && !next.startsWith('-')) {
        flags[rawKey] = next;
        index++;
      } else {
        flags[rawKey] = true;
      }
      continue;
    }

    if (arg === '-o') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('Missing value for -o.');
      }
      flags.output = next;
      index++;
      continue;
    }

    positionals.push(arg);
  }

  return { flags, positionals };
}

function getBooleanFlag(flags, name) {
  return Boolean(flags[name]);
}

function getStringFlag(flags, name, fallback) {
  const value = flags[name];
  return value === undefined || value === true ? fallback : value;
}

function getNumberFlag(flags, name, fallback) {
  const value = flags[name];
  if (value === undefined || value === true) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${name}: ${value}`);
  }

  return parsed;
}

function normalizeFormat(format) {
  const normalized = String(format || 'png').toLowerCase();
  if (normalized === 'jpg') {
    return 'jpeg';
  }

  if (normalized !== 'png' && normalized !== 'jpeg') {
    throw new Error(`Unsupported format: ${format}`);
  }

  return normalized;
}

function defaultImageOutput(inputPath, format) {
  const parsed = path.parse(inputPath);
  const extension = format === 'jpeg' ? '.jpg' : '.png';
  return path.join(parsed.dir, `${parsed.name}${extension}`);
}

function defaultTextOutput(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.txt`);
}

function logWrite(label, outputPath) {
  console.log(`${label}: ${outputPath}`);
}

async function runImg2Txt(inputPath, flags) {
  const text = await imageToAscii(inputPath, {
    cols: getNumberFlag(flags, 'cols', undefined),
    charAspect: getNumberFlag(flags, 'char-aspect', 0.5),
    chars: getStringFlag(flags, 'chars', undefined),
  });

  const outputPath = getStringFlag(flags, 'output', undefined);
  const writeToStdout = getBooleanFlag(flags, 'stdout') || !outputPath;

  if (writeToStdout) {
    process.stdout.write(`${text}\n`);
    return;
  }

  await writeTextFile(outputPath, text, { force: getBooleanFlag(flags, 'force') });
  logWrite('Wrote ASCII', outputPath);
}

async function runTxt2Img(inputPath, flags) {
  const format = normalizeFormat(getStringFlag(flags, 'format', DEFAULT_ASCII_TO_IMAGE_OPTIONS.format));
  const outputPath = getStringFlag(flags, 'output', defaultImageOutput(inputPath, format));
  const ascii = await readAsciiFile(inputPath);
  const image = asciiToImage(ascii, {
    scale: getNumberFlag(flags, 'scale', DEFAULT_ASCII_TO_IMAGE_OPTIONS.scale),
    width: getNumberFlag(flags, 'width', DEFAULT_ASCII_TO_IMAGE_OPTIONS.width),
    height: getNumberFlag(flags, 'height', DEFAULT_ASCII_TO_IMAGE_OPTIONS.height),
    charAspect: getNumberFlag(flags, 'char-aspect', DEFAULT_ASCII_TO_IMAGE_OPTIONS.charAspect),
    invert: getBooleanFlag(flags, 'invert'),
    chars: getStringFlag(flags, 'chars', DEFAULT_ASCII_TO_IMAGE_OPTIONS.chars),
    horizontalBlur: getNumberFlag(flags, 'horizontal-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.horizontalBlur),
    verticalBlur: getNumberFlag(flags, 'vertical-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.verticalBlur),
    bilateralPasses: getNumberFlag(flags, 'bilateral-passes', DEFAULT_ASCII_TO_IMAGE_OPTIONS.bilateralPasses),
    bilateralSpatialSigma: getNumberFlag(flags, 'bilateral-spatial-sigma', DEFAULT_ASCII_TO_IMAGE_OPTIONS.bilateralSpatialSigma),
    bilateralRangeSigma: getNumberFlag(flags, 'bilateral-range-sigma', DEFAULT_ASCII_TO_IMAGE_OPTIONS.bilateralRangeSigma),
    contrastLow: getNumberFlag(flags, 'contrast-low', DEFAULT_ASCII_TO_IMAGE_OPTIONS.contrastLow),
    contrastHigh: getNumberFlag(flags, 'contrast-high', DEFAULT_ASCII_TO_IMAGE_OPTIONS.contrastHigh),
    gamma: getNumberFlag(flags, 'gamma', DEFAULT_ASCII_TO_IMAGE_OPTIONS.gamma),
    upscaleBlur: getNumberFlag(flags, 'upscale-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.upscaleBlur),
    detailBlur: getNumberFlag(flags, 'detail-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.detailBlur),
    detailThreshold: getNumberFlag(flags, 'detail-threshold', DEFAULT_ASCII_TO_IMAGE_OPTIONS.detailThreshold),
    detailAmount: getNumberFlag(flags, 'detail-amount', DEFAULT_ASCII_TO_IMAGE_OPTIONS.detailAmount),
    format,
    jpegQuality: getNumberFlag(flags, 'jpeg-quality', DEFAULT_ASCII_TO_IMAGE_OPTIONS.jpegQuality),
  });

  await writeBinaryFile(outputPath, image, { force: getBooleanFlag(flags, 'force') });
  logWrite('Wrote image', outputPath);
}

async function runRoundtrip(inputPath, flags) {
  const format = normalizeFormat(getStringFlag(flags, 'format', DEFAULT_ASCII_TO_IMAGE_OPTIONS.format));
  const txtOutputPath = getStringFlag(flags, 'txt-out', defaultTextOutput(inputPath));
  const imgOutputPath = getStringFlag(flags, 'img-out', defaultImageOutput(inputPath, format));
  const force = getBooleanFlag(flags, 'force');
  const sourceImage = await loadImage(inputPath);
  const hasExplicitWidth = flags.width !== undefined;
  const hasExplicitHeight = flags.height !== undefined;
  const hasExplicitScale = flags.scale !== undefined;

  const text = await imageToAscii(inputPath, {
    cols: getNumberFlag(flags, 'cols', undefined),
    charAspect: getNumberFlag(flags, 'char-aspect', 0.5),
    chars: getStringFlag(flags, 'chars', undefined),
  });

  await writeTextFile(txtOutputPath, text, { force });
  const image = asciiToImage(text, {
    scale: getNumberFlag(flags, 'scale', DEFAULT_ASCII_TO_IMAGE_OPTIONS.scale),
    width: getNumberFlag(
      flags,
      'width',
      !hasExplicitScale && !hasExplicitHeight ? sourceImage.width : DEFAULT_ASCII_TO_IMAGE_OPTIONS.width
    ),
    height: getNumberFlag(
      flags,
      'height',
      !hasExplicitScale && !hasExplicitWidth ? sourceImage.height : DEFAULT_ASCII_TO_IMAGE_OPTIONS.height
    ),
    charAspect: getNumberFlag(flags, 'char-aspect', DEFAULT_ASCII_TO_IMAGE_OPTIONS.charAspect),
    invert: getBooleanFlag(flags, 'invert'),
    chars: getStringFlag(flags, 'chars', DEFAULT_ASCII_TO_IMAGE_OPTIONS.chars),
    horizontalBlur: getNumberFlag(flags, 'horizontal-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.horizontalBlur),
    verticalBlur: getNumberFlag(flags, 'vertical-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.verticalBlur),
    bilateralPasses: getNumberFlag(flags, 'bilateral-passes', DEFAULT_ASCII_TO_IMAGE_OPTIONS.bilateralPasses),
    bilateralSpatialSigma: getNumberFlag(flags, 'bilateral-spatial-sigma', DEFAULT_ASCII_TO_IMAGE_OPTIONS.bilateralSpatialSigma),
    bilateralRangeSigma: getNumberFlag(flags, 'bilateral-range-sigma', DEFAULT_ASCII_TO_IMAGE_OPTIONS.bilateralRangeSigma),
    contrastLow: getNumberFlag(flags, 'contrast-low', DEFAULT_ASCII_TO_IMAGE_OPTIONS.contrastLow),
    contrastHigh: getNumberFlag(flags, 'contrast-high', DEFAULT_ASCII_TO_IMAGE_OPTIONS.contrastHigh),
    gamma: getNumberFlag(flags, 'gamma', DEFAULT_ASCII_TO_IMAGE_OPTIONS.gamma),
    upscaleBlur: getNumberFlag(flags, 'upscale-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.upscaleBlur),
    detailBlur: getNumberFlag(flags, 'detail-blur', DEFAULT_ASCII_TO_IMAGE_OPTIONS.detailBlur),
    detailThreshold: getNumberFlag(flags, 'detail-threshold', DEFAULT_ASCII_TO_IMAGE_OPTIONS.detailThreshold),
    detailAmount: getNumberFlag(flags, 'detail-amount', DEFAULT_ASCII_TO_IMAGE_OPTIONS.detailAmount),
    format,
    jpegQuality: getNumberFlag(flags, 'jpeg-quality', DEFAULT_ASCII_TO_IMAGE_OPTIONS.jpegQuality),
  });

  await writeBinaryFile(imgOutputPath, image, { force });
  logWrite('Wrote ASCII', txtOutputPath);
  logWrite('Wrote image', imgOutputPath);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help')) {
    const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : undefined;
    printHelp(command);
    return;
  }

  if (argv.includes('--version')) {
    console.log(pkg.version);
    return;
  }

  const [command, ...rest] = argv;
  const { flags, positionals } = parseArgs(rest);

  if (flags.help) {
    printHelp(command);
    return;
  }

  const inputPath = positionals[0];
  if (!inputPath) {
    throw new Error('An input path is required.');
  }

  switch (command) {
    case 'img2txt':
      await runImg2Txt(inputPath, flags);
      return;
    case 'txt2img':
      await runTxt2Img(inputPath, flags);
      return;
    case 'roundtrip':
      await runRoundtrip(inputPath, flags);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
