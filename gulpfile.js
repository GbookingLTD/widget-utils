'use strict';

var gulp = require('gulp');
var bump = require('gulp-bump');
var buffer = require('vinyl-buffer');
var source = require('vinyl-source-stream');

var $ = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'del']
});

var rollupPluginNodeResolve = require('@rollup/plugin-node-resolve');
var rollupStream = require('@rollup/stream');
var rollupIncludePaths = require('rollup-plugin-includepaths');
var babel = require('rollup-plugin-babel');

var includePathOptions = {
    paths: ['src/']
};

gulp.task('compile', function() {
  return rollupStream({
      input: 'src/index.js',
      output: { name: 'WidgetUtils' },
      globals: {
        'lodash': '_',
        'moment-timezone': 'moment',
        'moment-range': 'momentRange',
      },
      external: ['lodash', 'moment-range', 'moment-timezone'],
      sourceMap: false,
      format: 'umd',
      moduleName: 'WidgetUtils',
      plugins: [
        rollupPluginNodeResolve(),
        babel({
          "babelrc": false,
          "presets": ["es2015-rollup"],
        }),
        rollupIncludePaths(includePathOptions)
      ]
    })
    .pipe(source('index.js'))
    .pipe(buffer())
    .on('error', $.util.log)
    //.pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest('dist'));
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
