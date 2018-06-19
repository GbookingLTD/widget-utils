"use strict";

/*
 This is wrapper for some crac-utils functions.
*/

// import {calcCRACSlotIntermediate} from '../bower_components/crac-utils/src';

import {setAnd, setUnion} from './crac';

// Remove this function after migration
function calcCRACSlotIntermediate(slot, vectorSlotSize) {
  return slot.resources.reduce((ret, res) => {
    let bitset = res.taxonomyBitSet ? setAnd(res.bitset, res.taxonomyBitSet) : res.bitset;
    return setUnion(ret, bitset);
  }, '0'.repeat(vectorSlotSize === 5 ? 288 : 1440).split('').map(() => 0));
}

export {
  calcCRACSlotIntermediate
}
