'use strict';

var gulp = require('gulp');
var bump = require('gulp-bump');

var $ = require('gulp-load-plugins')({
  pattern: ['gulp-*', 'del']
});

var rollupIncludePaths = require('rollup-plugin-includepaths');
var babel = require('rollup-plugin-babel');

var includePathOptions = {
    paths: ['../../bower_components/crac-utils/src/vector', 'src/']
};

gulp.task('compile', function() {
  return gulp.src('src/index.js', {read: false})
    .pipe($.rollup({
      globals: {
        'lodash': '_',
        'moment': 'moment'
      },
      external: ['moment-timezone'],
      sourceMap: false,
      format: 'umd',
      moduleName: 'WidgetUtils',
      plugins: [
        babel({
          "babelrc": false,
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
