# Makefile default

Create a Makefile only when at least one runnable surface was selected. `verify` must compose checks only; do not hide database bootstrap, migration, reset, environment provisioning, or deployment behind it. A database-only project gets no Makefile until `$grilling` settles a safe runner.

For a combined React web app in `web/` and Rust server in `server/`, each runtime keeps the Makefile in its own reference and the root owns this exact delegation graph. `dev` starts the primary web surface; run `make server-dev` in a second terminal. If the selected layout or primary surface differs, settle it with `$grilling` before writing a different root graph.

```make
.PHONY: dev typecheck check lint test build format verify web-dev web-typecheck web-lint web-test web-build web-format web-verify server-dev server-check server-lint server-test server-build server-format server-verify

dev: web-dev
typecheck: web-typecheck
check: server-check
lint: web-lint server-lint
test: web-test server-test
build: web-build server-build
format: web-format server-format
verify: web-verify server-verify

web-dev:
	$(MAKE) -C web dev
web-typecheck:
	$(MAKE) -C web typecheck
web-lint:
	$(MAKE) -C web lint
web-test:
	$(MAKE) -C web test
web-build:
	$(MAKE) -C web build
web-format:
	$(MAKE) -C web format
web-verify:
	$(MAKE) -C web verify

server-dev:
	$(MAKE) -C server dev
server-check:
	$(MAKE) -C server check
server-lint:
	$(MAKE) -C server lint
server-test:
	$(MAKE) -C server test
server-build:
	$(MAKE) -C server build
server-format:
	$(MAKE) -C server format
server-verify:
	$(MAKE) -C server verify
```
