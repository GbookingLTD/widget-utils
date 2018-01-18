'use strict';

var TAXONOMY_CHILDREN = 'CHILDREN';
var TAXONOMY_ADULT = 'PARENT';
var TAXONOMY_COMMON = 'COMMON';

export function setupChildishnes(taxonomies, resources, strictInclusion = true) {
  var childOnly = {};
  var adultOnly = {};
  var common = {};

  if(!Array.isArray(taxonomies) || !Array.isArray(resources) ){
    console.log('empty data');
    return taxonomies;
  }


  resources.forEach(function (r) {
    if(r.taxonomyChildren && r.taxonomyChildren.length > 0){
      var childs = [];
      var adults = [];

      r.taxonomyChildren.forEach(function (c) {
        var tax = c.taxonomyId;
        var childIndex = childs.indexOf(tax);
        var adultIndex = adults.indexOf(tax);
        if(childIndex < 0 && adultIndex < 0){
          c.children===true ? childs.push(tax) : adults.push(tax);
        }else{
          if(!common[tax]){
            common[tax] = true;
          }
          if(childIndex>=0){
            childs.splice(childIndex,1)
          }else{
            adults.splice(adultIndex,1)
          }
        }
      });

      childs.map(function(tax){
        if(!childOnly[tax]){
          childOnly[tax] = true;
        }
      });
      adults.map(function(tax){
        if(!adultOnly[tax]){
          adultOnly[tax] = true;
        }
      });
    }
  });

  taxonomies.forEach(function (t) {
    t.childrenTypes = getTaxonomyTypes(childOnly, adultOnly, common, t.id);
  })
  return taxonomies;
};


function getTaxonomyTypes(C, P, N, taxonomyID){
  var types = [];
  if(C[taxonomyID]){
    types.push(TAXONOMY_CHILDREN);
  }
  if(P[taxonomyID]){
    types.push(TAXONOMY_ADULT);
  }
  if((!C[taxonomyID] && !P[taxonomyID]) || N[taxonomyID]){
    types.push(TAXONOMY_COMMON);
  }
  return types;
}
