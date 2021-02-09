build:
	npm run build && \
        npm i -g . && \
		dts-gen -m widget-utils -o -f dist/index.d.ts

tests:
	npm run test

bump:
	npm run bump
