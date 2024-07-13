export const onScrollEnd = (el: HTMLElement | undefined, callback?: () => void) => {
  if (!el || !callback) return

  let timer: NodeJS.Timeout | null = null

  const handle = () => {
    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      el.removeEventListener('scroll', handle);
      callback();
    }, 100);
  }

  el.addEventListener('scroll', handle);
}
