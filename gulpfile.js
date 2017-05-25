'use strict';

var gulp = require('gulp');

var $ = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'del']
});

var rollupIncludePaths = require('rollup-plugin-includepaths');
var babel = require('rollup-plugin-babel');

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
      sourceMap: false,
      format: 'umd',
      moduleName: 'WidgetUtils',
      plugins: [
        babel({
          "presets": ["es2015-rollup"],
        }),
        rollupIncludePaths(includePathOptions)
      ]
    }))
    .on('error', $.util.log)
    //.pipe($.sourcemaps.write('.'))
    .pipe(gulp.dest('dist'));
});

gulp.task('watch', function() {
  return $.watch('src/**/*.js', function() {
    gulp.start('build');
  });
})

gulp.task('clean', function () {
  return $.del(['dist/**']);
});

gulp.task('build', ['clean'], function() {
  gulp.start('compile');
});

gulp.task('dev', ['build', 'watch']);

gulp.task('default', ['build']);
