# ascii-art-converter

Convert images to ASCII art and render ASCII art back into smoothed grayscale images.

## Install

Install as a package in another project:

```bash
npm install ascii-art-converter
```

Install dependencies:

```bash
npm install
```

Run the CLI locally:

```bash
node ./bin/ascii-art-converter.js --help
```

Expose the `ascii` command globally on your machine while developing:

```bash
npm link
ascii-art-converter --help
```

`canvas` is a native dependency. On some systems you may need additional OS packages or build tools before `npm install` succeeds.

## CLI

The package exposes three subcommands:

```bash
ascii-art-converter img2txt <input> [options]
ascii-art-converter txt2img <input.txt> [options]
ascii-art-converter roundtrip <input-image> [options]
```

By default, `roundtrip` renders the output image at the same `width x height` as the input image. You can still override that with `--scale`, `--width`, or `--height`.
By default, `img2txt` and the text-generation step inside `roundtrip` choose a denser column count automatically from the input width so the generated ASCII keeps more detail.

### `img2txt`

Convert an image into ASCII text.

```bash
ascii-art-converter img2txt ./art.jpeg --cols 200 -o ./art.txt
```

Options:

- `-o, --output <file>`: write ASCII to a file instead of stdout
- `--cols <number>`: number of columns to sample, default is automatic based on input width
- `--char-aspect <number>`: character aspect ratio, default `0.5`
- `--chars <string>`: custom character set used to build the density ramp
- `--stdout`: force output to stdout
- `--force`: overwrite the output file if it already exists

### `txt2img`

Render an ASCII text file into an image.

```bash
ascii-art-converter txt2img ./art.txt -o ./image.png --scale 10
```

Options:

- `-o, --output <file>`: output image path, defaults to the input basename with `.png` or `.jpg`
- `--scale <number>`: pixels per character, default `10`
- `--width <number>`: explicit output width in pixels
- `--height <number>`: explicit output height in pixels
- `--char-aspect <number>`: character aspect ratio, default `0.5`
- `--invert`: invert the light/dark mapping
- `--chars <string>`: custom character set used to build the density ramp
- `--format <png|jpeg>`: output format, default `png`
- `--jpeg-quality <0-1>`: JPEG quality, default `0.92`
- `--horizontal-blur <number>`: grid horizontal blur radius
- `--vertical-blur <number>`: grid vertical blur radius
- `--bilateral-passes <number>`: bilateral smoothing passes
- `--bilateral-spatial-sigma <number>`: bilateral spatial sigma
- `--bilateral-range-sigma <number>`: bilateral range sigma
- `--contrast-low <0-1>`: lower contrast percentile
- `--contrast-high <0-1>`: upper contrast percentile
- `--gamma <number>`: gamma adjustment
- `--upscale-blur <number>`: Gaussian blur applied after upscaling
- `--detail-blur <number>`: smoothing sigma used for detail enhancement
- `--detail-threshold <number>`: detail enhancement threshold
- `--detail-amount <number>`: detail enhancement strength
- `--force`: overwrite the output file if it already exists

### `roundtrip`

Generate both the ASCII text and rendered image from an input image.

```bash
ascii-art-converter roundtrip ./art.jpeg --cols 200 --txt-out ./art.txt --img-out ./image.png
```

When no output size flags are passed, the generated image keeps the same dimensions as `./art.jpeg`.

Options:

- `--txt-out <file>`: output text file, defaults to the input basename with `.txt`
- `--img-out <file>`: output image file, defaults to the input basename with `.png` or `.jpg`
- `--cols <number>`: number of columns for the image-to-text step, default is automatic based on input width
- `--scale <number>`: override the default size-matching behavior with pixels per character
- `--width <number>`: explicit output width in pixels
- `--height <number>`: explicit output height in pixels
- `--char-aspect <number>`: shared character aspect ratio
- `--chars <string>`: custom character set used to build the density ramp
- `--invert`: invert the light/dark mapping for the render step
- `--format <png|jpeg>`: output image format
- `--force`: overwrite output files if they already exist

## Library Usage

CommonJS:

```js
const fs = require('fs');
const { imageToAscii, asciiToImage } = require('ascii-art-converter');

async function main() {
  const ascii = await imageToAscii('./art.jpeg', { cols: 120 });
  fs.writeFileSync('./art.txt', ascii, 'utf8');

  const imageBuffer = asciiToImage(ascii, {
    scale: 10,
    horizontalBlur: 5,
    gamma: 0.9,
  });

  fs.writeFileSync('./image.png', imageBuffer);
}

main().catch(console.error);
```

Available exports:

- `imageToAscii(input, options)`
- `asciiToImage(ascii, options)`
- `DEFAULT_ASCII_TO_IMAGE_OPTIONS`
- `DEFAULT_CHARSET`
- `buildDensityRamp(chars, fontSize)`
- `getDensityRamp(chars, fontSize)`
- `getDensityMap(chars, fontSize)`

## Key `asciiToImage` Options

These options are especially useful when tuning the rendered output:

- `scale`: output size in pixels per character
- `horizontalBlur` and `verticalBlur`: control grid smoothing before upscaling
- `bilateralPasses`, `bilateralSpatialSigma`, `bilateralRangeSigma`: smooth similar-density regions while preserving strong edges
- `contrastLow`, `contrastHigh`, `gamma`: control tonal mapping
- `upscaleBlur`, `detailBlur`, `detailThreshold`, `detailAmount`: control the final softness and edge boldness

## Examples

Write ASCII to stdout:

```bash
ascii-art-converter img2txt ./art.jpeg --cols 120 --stdout
```

Render a lighter, softer image:

```bash
ascii-art-converter txt2img ./art.txt -o ./image.png --gamma 0.9 --horizontal-blur 5 --upscale-blur 2
```

Create a JPEG instead of a PNG:

```bash
ascii-art-converter txt2img ./art.txt -o ./image.jpg --format jpeg --jpeg-quality 0.9
```
