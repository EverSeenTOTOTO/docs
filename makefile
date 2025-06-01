.PHONY: lint
lint:
	zx .scripts/*.js

.PHONY: build
build:
	bun run docs:build
	tar -cvzf vp.tar.gz .vitepress

.PHONY: dev
dev:
	bun run docs:dev

.PHONY: start
start: build
	bun run docs:preview
