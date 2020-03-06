'use strict';

var gulp = require('gulp');
var bump = require('gulp-bump');
var mergeStream = require('merge-stream');
var path = require('path');
var buffer = require('vinyl-buffer');
var source = require('vinyl-source-stream');

var $ = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'del']
});

var rollupPluginNodeResolve = require('@rollup/plugin-node-resolve');
var rollupStream = require('@rollup/stream');
var babel = require('rollup-plugin-babel');

const compilationTargets = [
  {
    // TODO: move to `dist/cjs/index.js` when we ensure nobody relies on this
    // concrete file, even though it's "widget-utils"'s implementation detail
    outputPath: 'dist/index.js',
    rollupOptions: {
      output: { format: 'cjs' },
    },
  },
  {
    outputPath: 'dist/es/index.js',
    rollupOptions: {
      output: { format: 'es' },
    },
  },
];

// How to setup caching with "@rollup/stream":
// https://github.com/rollup/stream/tree/34bda6c45f1254cc470ea5510ae7fbbc092a023e#caching
const compilationCache = new Map();

gulp.task('compile', function() {
  return mergeStream(...compilationTargets.map(target =>
    rollupStream({
      input: 'src/index.js',
      external: ['lodash', 'moment-range', 'moment-timezone'],
      sourceMap: false,
      plugins: [
        rollupPluginNodeResolve(),
        babel({
          "babelrc": false,
          "presets": ["es2015-rollup"],
        }),
      ],
      cache: compilationCache.get(target),
      ...target.rollupOptions,
    })
    .on('bundle', bundle => {
      compilationCache.set(target, bundle);
    })
    .pipe(source(path.basename(target.outputPath)))
    .pipe(buffer())
    .on('error', $.util.log)
    //.pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest(path.dirname(target.outputPath)))
  ));
});

gulp.task('watch', function() {
  return $.watch('src/**/*.js', function() {
    gulp.start('build');
  });
});

gulp.task('clean', function () {
  return $.del(['dist/**']);
});

gulp.task('bump', function(){
  gulp.src(['./bower.json', './package.json'])
  .pipe(bump({type:'patch'}))
  .pipe(gulp.dest('./'));
});

gulp.task('build', ['clean'], function() {
  gulp.start('compile');
});

gulp.task('dev', ['build', 'watch']);

gulp.task('default', ['build']);
