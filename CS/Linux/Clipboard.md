# Clipboard

在Neovim、Tmux和系统剪贴板之间复制粘贴，考虑Mac、Linux及Linux下X11和Wayland的差异（借助`pbcopy`、`xclip`和`wl-copy`）。Nvim 的Clipboard Provider其实内置有对它们的支持，但是没搞明白怎么同时支持系统剪贴板和tmux，索性自定义一下：

## Neovim

```lua
local function setup_clipboard()
  local has_mac = vim.fn.has('mac') == 1
  local has_wsl = vim.fn.has('wsl') == 1 or vim.fn.executable('clip.exe') == 1
  local has_x11 = vim.env.DISPLAY ~= nil and vim.fn.executable('xclip') == 1
  local has_wayland = vim.env.WAYLAND_DISPLAY ~= nil and vim.fn.executable('wl-copy') == 1
  local has_tmux = vim.env.TMUX ~= nil

  vim.opt.clipboard = 'unnamedplus'

  -- 如果没有外部工具，使用 nvim 默认剪贴板
  local has_external_clipboard = has_mac or has_wsl or has_x11 or has_wayland
  if not has_external_clipboard then return end

  vim.g.clipboard = {
    name = 'custom',
    copy = {
      ['+'] = function(lines)
        local text = table.concat(lines, '\n')

        -- 复制到系统剪贴板
        if has_mac then
          vim.fn.system('pbcopy', text)
        elseif has_wayland then
          vim.fn.system('wl-copy', text)
        elseif has_x11 then
          vim.fn.system('xclip -i -sel c', text)
        elseif has_wsl then
          vim.fn.system('clip.exe', text)
        end

        -- 同步到 tmux
        if has_tmux then vim.fn.system('tmux set-buffer -- ' .. vim.fn.shellescape(text)) end
      end,
      ['*'] = function(lines) vim.g.clipboard.copy['+'](lines) end,
    },
    paste = {
      ['+'] = function()
        local text = ''
        if has_mac then
          text = vim.fn.system('reattach-to-user-namespace pbpaste')
        elseif has_wayland then
          text = vim.fn.system('wl-paste --no-newline')
        elseif has_x11 then
          text = vim.fn.system('xclip -o -sel c')
        elseif has_wsl then
          -- 使用 powershell.exe 并去除 Windows 换行符
          text = vim.fn.system('powershell.exe -NoProfile -Command "Get-Clipboard"')
          -- 去除 ^M (CR) 字符
          text = text:gsub('\r\n', '\n'):gsub('\r', '')
        end

        -- ssh session
        if has_tmux and vim.env.XDG_SESSION_TYPE == 'tty' then text = vim.fn.system('tmux show-buffer') end

        return vim.split(text, '\n')
      end,
      ['*'] = function() return vim.g.clipboard.paste['+']() end,
    },
    cache_enabled = 0,
  }
end

setup_clipboard()
```

为了体验，可以在复制之后添加以短暂的高亮：

```lua
autocmd('TextYankPost', {
  pattern = '*',
  callback = function()
    -- highlight yanked text for 700ms
    vim.highlight.on_yank({ higroup = 'IncSearch', timeout = 700 })
  end,
})
  ```

## Tmux

```bash
# 绑定v键为进入复制模式
bind v copy-mode
bind-key -T copy-mode-vi v send-keys -X begin-selection
unbind -T copy-mode-vi Enter
# y键复制
bind -T copy-mode-vi y send-keys -X copy-selection
# P键粘贴
bind P run "tmux paste-buffer"

if-shell -b '[ "$(uname -s)" == "Darwin" ]' {
  bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"
  bind P run "tmux set-buffer \"\$(reattach-to-user-namespace pbpaste)\"; tmux paste-buffer"
}

if-shell -b '[ "$(uname -s)" == "Linux" ]' {
  if-shell -b '[ "$(echo $XDG_SESSION_TYPE)" == "wayland" ]' {
    bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel 'wl-copy'
    bind P run "tmux set-buffer \"\$(wl-paste)\"; tmux paste-buffer"
  }

  if-shell -b  '[ "$(echo $XDG_SESSION_TYPE)" == "x11" ]' {
    bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel 'xclip -i -sel c'
    bind P run "tmux set-buffer \"\$(xclip -o -sel c)\"; tmux paste-buffer"
  }
}

# WSL clipboard support
if-shell -b 'command -v powershell.exe' {
  bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel 'clip.exe'
  bind P run "tmux set-buffer \"\$(powershell.exe -Command Get-Clipboard)\"; tmux paste-buffer"
}
```
