"use strict";

import {prepareBitset, getCracVectorSlotSize, calcCRACSlotIntermediate} from '../../bower_components/crac-utils/src';

let assert = console.assert ? console.assert.bind(console) : function() {};

export class CRACResourcesAndRoomsSlot {
  /* date;
  dateUnix;
  dateDate;
  resources;
  durations;*/

  constructor(cracSlot) {
    this.prepare(cracSlot);
  }

  prepare(cracSlot) {
    let dateUnix;
    assert(cracSlot.date && !isNaN(dateUnix = Date.parse(cracSlot.date)), 'cracSlot.date should be valid date');
    this.date = cracSlot.date;
    this.dateUnix = dateUnix;
    this.dateDate = new Date(dateUnix);
    
    const bitsetAssert = (bitset) => {
      assert(bitset && (typeof bitset === 'string' && bitset.length >= 288 ||
        Array.isArray(bitset) && bitset.length >= 9), 'res.bitset should contain at least 288 bits');
    };
    
    this.resources = [];
    for (const res of cracSlot.resources || []) {
      assert(res.resourceId, 'resource should have id');
      bitsetAssert(res.bitset);
      bitsetAssert(res.taxonomyBitSet);
      this.resources.push({
        id: res.resourceId,
        durations: res.durations || [],
        bitset: prepareBitset(res.bitset, getCracVectorSlotSize(res.bitset)),
        //taxonomyBitSet: prepareBitset(res.taxonomyBitSet, getCracVectorSlotSize(res.taxonomyBitSet))
      });
    }
    
    this.excludedResources = cracSlot.excludedResources || [];
  }
  
  getResource(resourceID) {
    const isExcluded = this.excludedResources && this.excludedResources.indexOf(resourceID) !== -1;
    if (isExcluded) return null;
    const resourceData = this.resources.find(r => r.id === resourceID);
    if (resourceData) return resourceData.bitset;
    return null;
  }
  
  getResourceIntersection() {
    return calcCRACSlotIntermediate(this);
  }
}

export class CRACResourcesAndRoomsResponse {
  /* error;
  slots;*/
  
  constructor(cracData) {
    this.slots = [];
    this.prepare(cracData);
  }
  
  prepare(cracData) {
    if (cracData.error) this.error = cracData.error;
    if (!cracData.slots) return false;
    this.slots = [];
    for (const cracSlot of cracData.slots) {
      const slot = new CRACResourcesAndRoomsSlot(cracSlot);
      this.slots.push(slot);
    }
    
    return true;
  }
}