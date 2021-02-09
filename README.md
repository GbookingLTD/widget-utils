## Building

[sudo] npm install -g dts-gen
[sudo] npm link // <-- in the root widget-utils directory

```
make build
```

or

```
npm run build
npm i -g .
dts-gen -m widget-utils -o -f dist/index.d.ts
```

----

for deployment
sudo bower --allow-root update widget-utils

----

for development

in widget-utils project root folder
bower link

in widget folder
bower link widget-utils
