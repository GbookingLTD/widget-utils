'use strict';

var gulp = require('gulp');

var $ = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'del']
});

gulp.task('umd', function() {
  return gulp.src('src/*.js')
    .pipe($.umd())
    .pipe(gulp.dest('dist'));
});

gulp.task('clean', function () {
  return $.del(['dist/']);
});

gulp.task('default', ['clean'], function () {
  gulp.start('umd');
});