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
    outputPath: 'dist/index.js',
    rollupOptions: {
      output: { format: 'cjs' },
    },
  },
];

gulp.task('compile', function() {
  return mergeStream(...compilationTargets.map(target =>
    rollupStream({
      input: 'src/index.js',
      globals: {
        'lodash': '_',
        'moment-timezone': 'moment',
        'moment-range': 'momentRange',
      },
      external: ['lodash', 'moment-range', 'moment-timezone'],
      sourceMap: false,
      plugins: [
        rollupPluginNodeResolve(),
        babel({
          "babelrc": false,
          "presets": ["es2015-rollup"],
        }),
      ],
      ...target.rollupOptions,
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
