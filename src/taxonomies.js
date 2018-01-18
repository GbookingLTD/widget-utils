'use strict';

var TAXONOMY_CHILDREN = 'CHILDREN';
var TAXONOMY_ADULT = 'PARENT';
var TAXONOMY_COMMON = 'COMMON';
var TAXONOMY_BOTH = 'BOTH';

export function setChildTaxonomies(taxonomies, resources, strictInclusion = true) {
  var childOnly = {};
  var adultOnly = {};


  if(!Array.isArray(taxonomies) || !Array.isArray(resources) ){
    console.log('empty data');
    return taxonomies;
  }

  childOnly = getTaxonomiesType(resources,true);
  adultOnly = getTaxonomiesType(resources,false);

  taxonomies.forEach(function (t) {
    t.childrenType = getTaxonomyType(childOnly, adultOnly, parseInt(t.id), strictInclusion);
  })
  return taxonomies;

};

function getTaxonomiesType(resources,isChild = true){
  var T = {};
  resources.forEach(function (r) {
    if(r.taxonomyChildren && r.taxonomyChildren.length > 0){
      r.taxonomyChildren.forEach(function (c) {
        if(c.children === isChild){
          T[parseInt(c.taxonomyID)] = true;
        }
      })
    }
  })
  return T;
}

function getTaxonomyType(C, P, taxonomyID, strictInclusion){
  if(strictInclusion){
    if(C[taxonomyID] && !P[taxonomyID]){
      return TAXONOMY_CHILDREN;
    }else if(!C[taxonomyID] && P[taxonomyID]){
      return TAXONOMY_ADULT;
    }else if(C[taxonomyID] && P[taxonomyID]){
      return TAXONOMY_BOTH;
    }
    return TAXONOMY_COMMON;
  } else {
    if(C[taxonomyID] && P[taxonomyID]){
      return TAXONOMY_BOTH;
    }else if(!C[taxonomyID] && !P[taxonomyID]){
      return TAXONOMY_COMMON;
    }else if(C[taxonomyID]){
      return TAXONOMY_CHILDREN;
    }
    return TAXONOMY_ADULT;
  }
}
