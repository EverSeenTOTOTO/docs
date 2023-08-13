#!/usr/bin/env zx

async function main() {
  const imgs = await glob("**/*.webp");

  for await (const img of imgs) {
    const dir = path.dirname(img);
    const file = path.basename(img);

    try {

      await $`rg ${file} ${dir}`;
    } catch (e) {
      if (/y/i.test(await question(`remove unused image ${img}?`))) {
        await $`rm -f ${img}`;
      }
    }
  }
}

main();


