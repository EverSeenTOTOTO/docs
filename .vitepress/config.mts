import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vitepress'
import mdFootnote from 'markdown-it-footnote'
import mdLinkOpen from './mdit-plugins/link-open';
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

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

  let items: any[] = [];

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

  items = items.sort((a, b) => {
    if (isReadmd(a.text)) return -1;
    if (isReadmd(b.text)) return 1;

    return 0;
  })

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

const resolvePath = (filepath: string) => fileURLToPath(
  new URL(filepath, import.meta.url)
)

export default defineConfig({
  title: "EverSeenFlash's Home",
  themeConfig: {
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
      prev: '上一篇',
      next: '下一篇'
    },

    search: {
      provider: 'local'
    }
  },

  transformHead(context) {
    context.head.push([
      'script',
      {
        defer: 'defer',
        src: "https://track.everseenflash.com/script.js",
        ['data-website-id']: '5f6141ab-be5c-49b0-b543-d62a6f417ec5'
      }
    ])
  },

  markdown: {
    math: true,
    config(md) {
      md.use(mdFootnote)
      md.use(mdLinkOpen)
    }
  },

  vite: {
    resolve: {
      alias: [
        {
          find: /^@vp/,
          replacement: resolvePath('./components/')
        },
        {
          find: /lxgw-webkai-lite-webfont/,
          replacement: resolvePath('../node_modules/lxgw-wenkai-lite-webfont/')
        },
        {
          find: /^.*\/VPSidebarItem\.vue$/,
          replacement: resolvePath('./components/VPSidebarItem.vue')
        }
      ]
    },

    plugins: [react()]

  }

})

