"use strict";

import {prepareBitset, getCracVectorSlotSize, setUnion, newBusyBitset} from 'crac-utils/src';

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
      let strictSlots = [];
      if(res.strictSlots) {
        try{
          strictSlots = JSON.parse(res.strictSlots);
        } catch(err){}
      }
      // bitsetAssert(res.taxonomyBitSet);
      let resource = {
        id: res.resourceId,
        durations: res.durations || [],
        bitset: prepareBitset(res.bitset, getCracVectorSlotSize(res.bitset)),
        strictSlots,
      };
      
      try {
        resource.taxonomyBitSet = prepareBitset(res.taxonomyBitSet, getCracVectorSlotSize(res.taxonomyBitSet))
      } catch (e) {}
      
      this.resources.push(resource);
    }
    
    this.excludedResources = cracSlot.excludedResources || [];
  }
  
  getResourceBitset(resourceID) {
    const isExcluded = this.excludedResources && this.excludedResources.indexOf(resourceID) !== -1;
    if (isExcluded) return null;
    const resourceData = this.resources.find(r => r.id === resourceID);
    if (resourceData) return resourceData.taxonomyBitSet ? setUnion(resourceData.bitset, resourceData.taxonomyBitSet) : resourceData.bitset;
    return null;
  }
  
  getResourceUnionBitset() {
    return this.resources.reduce((ret, res) => {
      let bitset = res.taxonomyBitSet ? setUnion(res.bitset, res.taxonomyBitSet) : res.bitset;
      return setUnion(ret, bitset);
    }, newBusyBitset());
  }
  
  getResourceUnionSlots() {
    const slotsMap = this.resources.reduce((ret, res) => {
      return (res.strictSlots || []).reduce((slots, slot) => {
        if (!slots[slot[0]]) {
          slots[slot[0]] = slot;
        }
      }, ret);
    }, {});
    return Object.values(slotsMap).sort();
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
