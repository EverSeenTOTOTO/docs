# Clipboard

在Neovim、Tmux和系统剪贴板之间复制粘贴，考虑Mac、Linux及Linux下X11和Wayland的差异（借助`pbcopy`、`xclip`和`wl-copy`）：

## Neovim 

```lua
autocmd("TextYankPost", {
  pattern = "*",
  callback = function()
    if vim.fn.has("mac") then
      vim.cmd([[call system('pbcopy && tmux set-buffer "$(reattach-to-user-namespace pbpaste)"', @")]])
    else
      local type = vim.fn.nvim_command('echo $XDG_SESSION_TYPE')

      if type == 'x11' and vim.fn.nvim_command('command -v xclip') ~= '' then
        -- xclip
        vim.cmd([[call system('xclip -i -sel c && tmux set-buffer $(xclip -o -sel c)', @")]])
      elseif type == 'wayland' and vim.fn.nvim_command('command -v wayland') ~= '' then
        -- wl-clipboard
        vim.cmd([[call system('wl-copy && tmux set-buffer $(wl-paste)', @")]])
      end
    end

    -- highlight yanked text for 700ms
    vim.highlight.on_yank { higroup = "IncSearch", timeout = 700 }
  end
})
```
## Tmux

```bash
bind v copy-mode # 绑定v键为进入复制模式
bind-key -T copy-mode-vi v send-keys -X begin-selection
unbind -T copy-mode-vi Enter

if-shell -b '[ "$(uname -s)" == "Darwin" ]' {
  bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"
  bind P run "tmux set-buffer \"\$(reattach-to-user-namespace pbpaste)\"; tmux paste-buffer"
}

if-shell -b '[ "$(uname -s)" == "Linux" ]' {
  if-shell -b '[ "$(echo $XDG_SESSION_TYPE)" == "x11" ]' {
    bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel 'xclip -i -sel c'
    bind P run "tmux set-buffer \"\$(xclip -o -sel c)\"; tmux paste-buffer"
  }

  if-shell -b '[ "$(echo $XDG_SESSION_TYPE)" == "wayland" ]' {
    bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel 'wl-copy'
    bind P run "tmux set-buffer \"\$(wl-paste)\"; tmux paste-buffer"
  }
}
```
