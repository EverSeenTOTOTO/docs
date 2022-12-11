#!/usr/bin/env zx

const SUFFIX = /\.(jpe?g|png|gif)/i;

async function optimizeImage(dirname, filename) {
  const fullpath = path.join(dirname, filename);
  const outputFilename = path.join(dirname, filename.replace(SUFFIX, '.webp'));

  if (/\.gif$/.test(filename)) {
    await $`ffmpeg -i ${fullpath} -hide_banner -loglevel error -loop 0 ${outputFilename}`;
  } else {
    await $`ffmpeg -i ${fullpath} -hide_banner -loglevel error -preset photo ${outputFilename}`;
  }

  fs.unlinkSync(fullpath);

  echo(`Removed ${fullpath}`);
}


function editFile(dirname, filename) {
  const fullpath = path.join(dirname, filename);
  const content = fs.readFileSync(fullpath, 'utf8');
  const lines = content.split("\n");

  echo(`Checking ${chalk.yellow(fullpath)}...`);

  let dirty = false;

  for (line of lines) {
    if (SUFFIX.test(line)) {
      let newLine = line.replace(SUFFIX, '.webp');

      lines.splice(lines.indexOf(line), 1, newLine);
      dirty = true;
    }
  }

  if (dirty) {
    echo(`Writing ${chalk.yellow(fullpath)}...`);
    fs.writeFileSync(fullpath, lines.join("\n"), "utf8")
  }
}

function scanDir(dir) {
  fs.readdirSync(dir).map(child => {
    const fullpath = path.join(dir, child);

    if (SUFFIX.test(child)) {
      optimizeImage(dir, child);
    } else if (/\.(md|markdown)$/i.test(child)) {
      editFile(dir, child);
    } else if (fs.statSync(fullpath).isDirectory()) {
      scanDir(fullpath);
    }
  })
}

scanDir('.');
