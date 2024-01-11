.PHONY: lint
lint:
	zx .scripts/*.js

.PHONY: build
build:
	pnpm run docs:build
	tar -cvzf vp.tar.gz .vitepress

.PHONY: start
start:
	pnpm run docs:dev
