'use strict';

import _ from 'lodash';

var TAXONOMY_CHILDREN = 'CHILDREN';
var TAXONOMY_ADULT = 'PARENT';
var TAXONOMY_COMMON = 'COMMON';

/**
 *
 * @param {Array<{id, additionalDurations, duration}>} taxonomy
 * @param {Array<{taxonomyLevels}>} resource
 * @return {*}
 */
export function getServiceDuration(taxonomy, resource) {
  if (resource) {
    var taxLevel = (_.find(resource.taxonomyLevels, {id: taxonomy.id}) || {}).level;
    if (typeof taxLevel !== 'undefined') {
      var level = _.find(taxonomy.additionalDurations, {level: taxLevel});
      if (level) {
        return level.duration ? level.duration : taxonomy.duration;
      }
    }
  }
  return taxonomy.duration;
}

/**
 * Возвращает минимальную длительность из всех услуг.
 *
 * Необходимо, например, для получения ближайшего доступного для записи по услуге(-ам) дня.
 *
 * @param taxonomies
 * @param resources
 */
export function findMinResourceServiceDuration(taxonomies, resources) {
  var minDuration = Number.MAX_SAFE_INTEGER;
  taxonomies.forEach(function (tax) {
    resources.forEach(function (res) {
      let duration = getServiceDuration(tax, res);
      if (duration < minDuration) {
        minDuration = duration;
      }
    });
  });

  return minDuration;
}

export function getMinServiceDuration(taxonomies, res) {
  var minDuration = Number.MAX_SAFE_INTEGER;
  taxonomies.forEach(function (tax) {
    let duration = getServiceDuration(tax, res);
    if (duration < minDuration) {
      minDuration = duration;
    }
  });

  return minDuration;
}

export function setupChildishnes(taxonomies, resources) {
  var C = {}; // child taxonomies
  var P = {}; // adult taxonomies
  var N = {}; // common taxonomies


  if (!Array.isArray(taxonomies) || !Array.isArray(resources)) {
    console.log('empty data');
    return taxonomies;
  }

  resources.forEach(function (r) {
    if (r.taxonomyChildren && r.taxonomyChildren.length > 0) {
      var rChildID = {}; // all tax id where children=true
      var rParentID = {}; // all tax id where children=false

      r.taxonomyChildren.forEach(function (c) {
        if (c !== null && typeof c.children !== 'undefined' && typeof c.taxonomyID !== 'undefined') {
          c.children === true ? rChildID[c.taxonomyID] = true : rParentID[c.taxonomyID] = true;
        }
      });

      r.taxonomyChildren.forEach(function (c) {
        if (c !== null && typeof c.children !== 'undefined' && typeof c.taxonomyID !== 'undefined') {
          // если услуга встречается 2-ды - как взрослая и как детская
          if (rChildID[c.taxonomyID] && rParentID[c.taxonomyID]) N[c.taxonomyID] = true;
          else if (rChildID[c.taxonomyID]) C[c.taxonomyID] = true;
          else if (rParentID[c.taxonomyID]) P[c.taxonomyID] = true;
        }
      });
    }
  });

  var getTaxonomyTypes = function (C, P, N, taxonomyID) {
    var types = [];
    if (C[taxonomyID]) {
      types.push(TAXONOMY_CHILDREN);
    }
    if (P[taxonomyID]) {
      types.push(TAXONOMY_ADULT);
    }
    if ((!C[taxonomyID] && !P[taxonomyID]) || N[taxonomyID]) {
      types.push(TAXONOMY_COMMON);
    }
    return types;
  };

  taxonomies.forEach(function (t) {
    t.childrenTypes = getTaxonomyTypes(C, P, N, parseInt(t.id));
  });
  return taxonomies;
}

