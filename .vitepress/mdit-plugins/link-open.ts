import type MarkdownIt from 'markdown-it'

export default (md: MarkdownIt) => {
  const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    if (/^http/.test(tokens[idx].attrGet("href"))) {
      tokens[idx].attrSet('target', '_blank');
    }

    return defaultRender(tokens, idx, options, env, self);
  };
}
