.PHONY: lint
lint:
	zx .scripts/*.js

.PHONY: build
build:
	yarn docs:build
	tar -cvzf vp.tar.gz .vitepress

.PHONY: start
start:
	yarn docs:dev
