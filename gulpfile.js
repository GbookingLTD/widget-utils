'use strict';

var gulp = require('gulp');

var $ = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'del']
});

var rollupIncludePaths = require('rollup-plugin-includepaths');

var includePathOptions = {
    paths: ['src/']
};

gulp.task('compile', function() {
  return gulp.src('src/widgetUtils.js', {read: false})
    .pipe($.rollup({
      external: [
        'lodash',
        'moment'
      ],
      sourceMap: true,
      format: 'umd',
      moduleName: 'WidgetUtils',
      plugins: [
        rollupIncludePaths(includePathOptions)
      ]
    }))
    .pipe($.babel())
    .on('error', $.util.log)
    .pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest('dist'));
});

gulp.task('clean', function () {
  return $.del(['dist/']);
});

gulp.task('default', ['clean'], function () {
  gulp.start('compile');
});