import React, { HTMLAttributes, useContext, useEffect, useImperativeHandle, useRef } from "react";
import { dataSymbol } from "vitepress/dist/client/app/data.js";
import { Component, createApp } from "vue";
import { ReactWrapContext } from "./context";

export default React.forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { app: Component }>(({ app: propsApp, ...rest }, forwardRef) => {
  const { vpData } = useContext(ReactWrapContext);
  const ref = useRef<HTMLDivElement>(null);

  useImperativeHandle(forwardRef, () => ref.current!);

  useEffect(() => {
    const app = createApp(propsApp);

    app.provide(dataSymbol, vpData);
    app.mount(ref.current!);
    return () => {
      app.unmount();
    };
  }, [vpData, propsApp]);

  return <div ref={ref} {...rest} />;
});
