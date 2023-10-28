import { defineConfig } from 'vitepress'
import mdFootnote from 'markdown-it-footnote'
import path from 'path';
import fs from 'fs';

const isDir = (filepath: string) => fs.statSync(filepath).isDirectory();
const isMd = (filepath: string) => /\.(md|markdown)$/i.test(filepath);
const isIgnored = (filepath: string) => /^\./.test(filepath) || /^node_modules$/.test(filepath);
const isReadmd = (filepath: string) => /^README\.(md|markdown)$/i.test(filepath);

const genNav = () => {
  const kids = fs.readdirSync('.');

  const dirs = kids.filter((each: string) => isDir(each) && !isIgnored(each));

  return dirs.map((dir: string) => {
    const prefix = path.join('.', dir);

    const children = fs.readdirSync(prefix).filter(isMd);

    const readme = children.find(isReadmd);

    if (readme) {
      return {
        text: dir,
        link: `/${dir}/${readme}`
      }
    } else if (children.length > 0) {
      return {
        text: dir,
        link: `/${dir}/${children[0]}`
      }
    }

    return undefined;
  }).filter(Boolean);
}

const genSideBarHelper = (prefix: string, filepath: string) => {
  const newPrefix = `${prefix}${filepath ? `/${filepath}` : ''}`;
  const kids = fs.readdirSync(path.join('.', newPrefix));
  const mds = kids.filter(isMd);

  const items: any[] = [];

  for (const dir of kids) {
    if (isDir(path.join('.', newPrefix, dir))) {
      items.push(
        genSideBarHelper(newPrefix, dir)
      )
    }
  }

  items.push(...mds.map(md => {
    return {
      text: md,
      link: `${newPrefix}/${md}`
    }
  }))

  return {
    text: filepath,
    items,
    collapsed: true
  };
}

const genSideBar = (nav: { text: string }[]) => {
  return nav.map(({ text }) => {
    return {
      text,
      items: genSideBarHelper(`/${text}`, '')?.items,
      collapsed: true,
    }
  })
}

const nav = genNav();
const sidebar = genSideBar(nav);

if (sidebar?.[0]) {
  sidebar[0].collapsed = false;
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "EverSeenFlash's Home",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav,

    sidebar,

    footer: {
      copyright: 'Copyright © 2021-present <a href="https://beian.miit.gov.cn/#/Integrated/index">皖ICP备20013181号</a>'
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/EverSeenTOTOTO' }
    ],

    lastUpdated: {
      text: '最近更新于',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short'
      },
    },

    docFooter: {
      prev: '下一篇',
      next: '上一篇'
    },

    search: {
      provider: 'local'
    }
  },
  markdown: {
    math: true,
    config(md) {
      md.use(mdFootnote)
    }
  }
})
