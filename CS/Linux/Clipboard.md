# Clipboard

在Neovim、Tmux和系统剪贴板之间复制粘贴，考虑Mac、Linux及Linux下X11和Wayland的差异（借助`pbcopy`、`xclip`和`wl-copy`）：

## Neovim

```lua
-- 在拷贝后将内容写入xclip等中介Buffer
local has_mac = vim.fn.has("mac")
local xdg_session_type = vim.api.nvim_command("echo $XDG_SESSION_TYPE")
local is_x11 = xdg_session_type == "x11" and vim.api.nvim_command("command -v xclip") ~= ""
local is_wayland = xdg_session_type == "wayland" and vim.api.nvim_command("command -v wayland") ~= ""

autocmd("TextYankPost", {
  pattern = "*",
  callback = function()
    if has_mac then
      vim.cmd([[call system('pbcopy && tmux set-buffer "$(reattach-to-user-namespace pbpaste)"', @")]])
    else
      if is_x11 then
        -- xclip
        vim.cmd([[call system('xclip -i -sel c && tmux set-buffer $(xclip -o -sel c)', @")]])
      elseif is_wayland then
        -- wl-clipboard
        vim.cmd([[call system('wl-copy && tmux set-buffer $(wl-paste)', @")]])
      end
    end

    vim.highlight.on_yank({ higroup = "IncSearch", timeout = 700 })
  end,
})
```

## Tmux

```bash
# 绑定v键为进入复制模式
bind v copy-mode
bind-key -T copy-mode-vi v send-keys -X begin-selection
unbind -T copy-mode-vi Enter

# 绑定y键拷贝
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
