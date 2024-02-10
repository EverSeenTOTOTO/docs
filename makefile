.PHONY: lint
lint:
	zx .scripts/*.js

.PHONY: build
build:
	pnpm run docs:build
	tar -cvzf vp.tar.gz .vitepress

.PHONY: dev
dev:
	pnpm run docs:dev

.PHONY: start
start: build
	pnpm run docs:preview
