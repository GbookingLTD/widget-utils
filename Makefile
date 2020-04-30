build:
	npm run build && \
		dts-gen -m widget-utils -o -f dist/index.d.ts

tests:
	npm run test

bump:
	npm run bump
