import React, { useContext, useEffect, useRef } from "react";
import { dataSymbol } from "vitepress/dist/client/app/data.js";
import { createApp } from "vue";
import { ReactWrapContext } from "./context";

export default ({ App, ...rest }) => {
	const { vpData } = useContext(ReactWrapContext);
	const container = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const app = createApp(App);

		app.provide(dataSymbol, vpData);
		app.mount(container.current!);

		return () => {
			app.unmount();
		};
	}, [vpData, App]);

	return <div ref={container} {...rest} />;
};
