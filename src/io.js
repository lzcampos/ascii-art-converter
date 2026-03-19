const fs = require('fs/promises');
const path = require('path');

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureWritable(targetPath, force = false) {
  if (!force && await fileExists(targetPath)) {
    throw new Error(`Output file already exists: ${targetPath}. Use --force to overwrite it.`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function readAsciiFile(targetPath) {
  return fs.readFile(targetPath, 'utf8');
}

async function writeTextFile(targetPath, contents, options = {}) {
  await ensureWritable(targetPath, options.force);
  await fs.writeFile(targetPath, contents, 'utf8');
}

async function writeBinaryFile(targetPath, contents, options = {}) {
  await ensureWritable(targetPath, options.force);
  await fs.writeFile(targetPath, contents);
}

module.exports = {
  fileExists,
  readAsciiFile,
  writeBinaryFile,
  writeTextFile,
};
