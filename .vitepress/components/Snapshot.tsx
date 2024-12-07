import React, { HTMLAttributes, useCallback, useEffect, useRef } from "react";

const serializer = typeof document !== 'undefined' ? new XMLSerializer() : { serializeToString: () => '' };

export default (name: string) => {
  const From: React.FC<{ render: (props: any) => React.ReactNode }> = ({ render }) => {
    const ref = useRef<any>();

    const snapshot = useCallback((e: Event) => {
      const el = ref.current;

      if (!el) return;

      const clone = el.cloneNode(true);
      const styles = window.getComputedStyle(el);

      for (let style of styles) {
        clone.style[style] = styles[style];
      }

      const toIndex = (e as CustomEvent).detail;

      document.dispatchEvent(new CustomEvent(`${name}_${toIndex}`, {
        detail: serializer.serializeToString(clone)
      }))
    }, []);

    useEffect(() => {
      document.addEventListener(`${name}_snap`, snapshot);

      return () => document.removeEventListener(`${name}_snap`, snapshot);
    }, []);

    return render({ ref });
  }

  let toIndex = 0;
  const To: React.FC<{ dependencies?: any[] } & HTMLAttributes<SVGElement>> = ({ dependencies = [], ...rest }) => {
    const ref = useRef<SVGForeignObjectElement>(null);

    useEffect(() => {
      ++toIndex;
      const handle = (e: Event) => {
        if (!ref.current) return;
        ref.current.innerHTML = (e as CustomEvent).detail;
      }

      document.addEventListener(`${name}_${toIndex}`, handle);

      return () => document.removeEventListener(`${name}_${toIndex}`, handle);
    }, []);
    useEffect(() => {
      document.dispatchEvent(new CustomEvent(`${name}_snap`, {
        detail: toIndex // only notify myself
      }));
    }, dependencies);

    return <svg xmlns="http://www.w3.org/2000/svg" {...rest}>
      <foreignObject ref={ref} x="0" y="0" width="100%" height="100%" />
    </svg>
  };


  return { From, To }
}
