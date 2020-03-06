'use strict';

import _ from 'lodash';
import moment from 'moment-timezone';
import {newFreeBitset, prepareBitset, getCracVectorSlotSize, getFirstLastMinutes, setAnd} from 'crac-utils/src';

function getDayBoundsFromCracSlot(date, bitset) {
  let cracSlotSize = getCracVectorSlotSize(bitset);
  bitset = prepareBitset(bitset, cracSlotSize);
  let dayBounds = getFirstLastMinutes(bitset, cracSlotSize);
  dayBounds.start_time = moment(date).add(dayBounds.start, 'minutes').toISOString();
  dayBounds.end_time = moment(date).add(dayBounds.end, 'minutes').toISOString();
  return dayBounds;
}


// Generate crunch-capable data from CRAC.
// Complexity: O(N), where N = 24hours / 5 minutes
function cutSlotsFromCrac(cracSlot, date, startMinutes, endMinutes, scheduleStrategy, scheduleSlotSize) {
  let cracSlotSize = getCracVectorSlotSize(cracSlot.bitset);
  let bitset = prepareBitset(cracSlot.bitset, cracSlotSize);
  let bitsetTaxonomy = cracSlot.taxonomyBitset ?
    prepareBitset(cracSlot.taxonomyBitset, cracSlotSize) : newFreeBitset();
  bitset = setAnd(bitset, bitsetTaxonomy);

  let dayBounds = getDayBoundsFromCracSlot(date, bitset);
  const slots = cutSlots(date, bitset, cracSlotSize, scheduleSlotSize, scheduleStrategy);
  return {
    available: _.find(slots, {available: true}),
    busy: slots,
    start_time: dayBounds.start_time,
    end_time: dayBounds.end_time
  };
}

// Special fix for `$scope.getEmptyDayLabel()` in `desktopwidget` app.
function isoDateForDayOff(date) {
  return moment(date).toISOString().replace('.000Z', 'Z');
}

/**
 * Presence CRAC data type as Crunch' Busy Slots
 *
 * Its need for soft migration from Crunch to CRAC
 *
 * @param  {Array<Object>} cracSlots CRAC response format
 * @param {{}} business
 * @param {Array} taxonomyIDs
 * @param {Array} [resourceIDs = []]
 * @param {*} [scheduleStrategy = null]
 * @return {{taxonomyId: *, slots_size: number, maxSlotCapacity: number, daysOff: Array, excludedResources: Array, days: *}}
 */
export function toBusySlots(cracSlots, business, taxonomyIDs, resourceIDs = [], scheduleStrategy = null) {
  const daysOff = [];
  const excludedResources = [];
  const excludedResourcesCountMap = {};

  function excludedResource(resource_id, date) {
    excludedResourcesCountMap[resource_id] = (excludedResourcesCountMap[resource_id] || 0) + 1;
    daysOff.push({ date, resource_id });
  }

  const busySlotsResponse = {
    taxonomyIDs,
    daysOff,
    excludedResources,
    days: _.map(cracSlots, function(cracSlot) {
      const { date } = cracSlot;
      var dayBounds;
      dayBounds = getDayBoundsFromCracSlot(date, cracSlot);

      if (!dayBounds) {
        const dayOffDate = isoDateForDayOff(date);
        business.resources.forEach((rr) => excludedResource(rr.id, dayOffDate));

        return {
          date,
          slots: {
            busy: [],
            available: false
          }
        };
      } else {
        let dayStart = dayBounds.start;
        let startTime = dayBounds.start_time;
        const dayEnd = dayBounds.end;


        const slots = cutSlotsFromCrac(cracSlot, date, dayStart, dayEnd, scheduleStrategy,
          scheduleStrategy.getSlotSize(business, taxonomyIDs, resourceIDs[0]));

        if (cracSlot.excludedResources) {
          const dayOffDate = isoDateForDayOff(date);
          cracSlot.excludedResources.forEach((rid) => excludedResource(rid, dayOffDate));
        }

        return {
          date,
          start_time: slots.start_time || startTime,
          end_time: slots.end_time || dayBounds.end_time,
          slots,
        };
      }
    }),
  };

  // Post processing of excludedResources
  const daysCount = busySlotsResponse.days.length;
  for (const resourceId in excludedResourcesCountMap) {
    if (Object.prototype.hasOwnProperty.call(excludedResourcesCountMap, resourceId)) {
      if (excludedResourcesCountMap[resourceId] >= daysCount) {
        excludedResources.push(resourceId);
      }
    }
  }

  return busySlotsResponse;
}
