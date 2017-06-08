'use strict';

import _ from 'lodash';
import moment from 'moment';


const SLOT_SIZE = 5;


// Compute start_time/end_time according to given day schedule.
function getDayBoundsFromShedule(daySchedule, date) {
  return {
    start_time: moment(date).startOf('day').add(daySchedule.start, 'minutes').utc().toDate().toString(),
    start: daySchedule.start,

    end_time: moment(date).startOf('day').add(daySchedule.end, 'minutes').utc().toDate().toString(),
    end: daySchedule.end,
  };
}


// Return day bounds for day from timetable using cache.
function getDayBoundsFromTimetable(date, timetable, timetableCache = {}) {
  if (timetable.active !== true) {
    return null;
  }

  const weekday = moment(date).weekday();

  if (timetableCache[weekday]) {
    return timetableCache[weekday];
  }

  let dayScheduleArray;
  switch(weekday) {
  	case 0:
    case 7: dayScheduleArray = timetable.week.sun; break;
  	case 1: dayScheduleArray = timetable.week.mon; break;
  	case 2: dayScheduleArray = timetable.week.tue; break;
  	case 3: dayScheduleArray = timetable.week.wed; break;
  	case 4: dayScheduleArray = timetable.week.thu; break;
  	case 5: dayScheduleArray = timetable.week.fri; break;
  	case 6: dayScheduleArray = timetable.week.sat; break;
    default: return null;
  }

  const daySchedule = dayScheduleArray && dayScheduleArray[0];
  if (daySchedule) {
    const dayBounds = getDayBoundsFromShedule(daySchedule, date);
    timetableCache[weekday] = dayBounds;
    return dayBounds;
  }

  return null;
}


function cracValueToBits(value) {
  const bits = [];
  // Fastest way to parse stringifyed bitmask
  Array.prototype.forEach.call(value, function(sign) {
    if (sign === '0' || sign === '1') {
      bits.push(parseInt(sign));
    }
  });
  return bits;
}


// Generate crunch-capable data from CRAC.
// Complexity: O(N), where N = 24hours / 5 minutes
function getCrunchSlotsFromCrac(cracSlot, date, startMinutes, endMinutes, maxSlotSize) {
  const busySlots = [];
  let available = false;
  let start_time, end_time;

  const bitmask = cracValueToBits(cracSlot.bitset);
  const reverseOffset = bitmask.length - 1;
  let startBitIndex = typeof startMinutes === 'undefined' ? 0 : Math.floor(startMinutes / SLOT_SIZE);
  let endBitIndex = typeof endMinutes === 'undefined' ? reverseOffset : Math.floor(endMinutes / SLOT_SIZE);
  const resultDate = moment.utc(date);

  let currentSlot;
  function commitSlot() {
    const startMinutes = currentSlot.start;
    const time = resultDate.clone().set({
      minutes: startMinutes % 60,
      hours: Math.floor(startMinutes / 60),
    });
    currentSlot.time = time.toISOString();
    currentSlot.startTS = time.unix();
    currentSlot.end = startMinutes + currentSlot.duration;
    busySlots.push(currentSlot);

    // console.info('commitSlot', currentSlot.time, currentSlot.start, currentSlot.end, currentSlot.duration);

    currentSlot = undefined;
  }

  function makeSlot(startMinutes) {
    // Make busy slot
    currentSlot = {
      space_left: 0,
      start: startMinutes,
      duration: SLOT_SIZE,
      partial_busy: null,
    };

    // console.info('makeSlot', startMinutes);
  }

  // console.log(date, bitmask.slice(reverseOffset - endBitIndex + 1, reverseOffset - startBitIndex).join(''));

  // Walking through bitmaks in reverse direction.
  for (var ii = startBitIndex; ii < endBitIndex; ii++) {
    const bitIndex = reverseOffset - ii;
    const bit = bitmask[bitIndex];
    const minutes = ii * SLOT_SIZE;

    // console.log('--> ', ii, bit, minutes);

    if (bit === 1) {
      if (!currentSlot) {
        // console.info('switched to `1` bit', minutes);
        makeSlot(minutes);
        // console.log('currentSlot.duration:', currentSlot && currentSlot.duration);
      } else {
        currentSlot.duration += SLOT_SIZE;
        // console.log('currentSlot.duration:', currentSlot && currentSlot.duration);

        if (currentSlot.duration >= maxSlotSize) {
          commitSlot();
          // console.info('separate by maxSlotSize', maxSlotSize);
          makeSlot(minutes);
        }
      }
    } else if (bit === 0) {
      available = true;
      if (currentSlot) {
        // console.info('switched to `0` bit', minutes);
        commitSlot();
      }
    }
  }

  if (currentSlot) {
    // console.info('ensure last slot');
    commitSlot();
  }

  const busySlotsLength = busySlots.length;

  // Change start_time bounds according to near available time.
  if (bitmask[reverseOffset - startBitIndex] === 1) {
    let startSlot = busySlots[0];
    for (let ii = 1; ii < busySlotsLength; ii++) {
      let slot = busySlots[ii];
      if (startSlot.end === slot.start) {
        startSlot = slot;
      } else {
        break;
      }
    }

    start_time = moment.utc(date)
                  .startOf('day')
                  .add(startSlot.end, 'minutes')
                  .toISOString();
  }

  // Change end_time bounds according to near available time.
  if (bitmask[reverseOffset - endBitIndex + 1] === 1) {
    let endSlot = busySlots[busySlotsLength - 1];
    for (let ii = busySlotsLength - 2; ii >= 0; ii--) {
      let slot = busySlots[ii];
      if (endSlot.start === slot.end) {
        endSlot = slot;
      } else {
        break;
      }
    }

    end_time = endSlot.time;
  }

  return {
    available,
    busy: busySlots,
    start_time,
    end_time,
  };
}


/**
 * Presense CRAC data type as Crunch' Busy Slots
 *
 * Its need for soft migration from Crunch to CRAC
 *
 * @param  {CracBusySlots|Array<Object>} cracSlots CRAC response format
 * @return {CrunBusySlot|Object}           Crunch response format
 */
export function toBusySlots(cracSlots, business, taxonomyIDs) {
  const businessTimetable = business.general_info.timetable;
  const businessTimetableCache = {};
  const daysOff = [];
  const excludedResources = [];
  const excludedResourcesCountMap = {};
  let visitedDaysCount = 0;
  let maxSlotDuration = -1;

  // TODO: compute daysOff when all day of resource is not available.

  if (taxonomyIDs && taxonomyIDs.length) {
    const taxonomies = _.filter(
      business.taxonomies,
      (tt) => taxonomyIDs.indexOf(String(tt.id)) >= 0
    );

    const maxTaxonomyDuration = _.max(taxonomies, 'duration');
    if (maxTaxonomyDuration) {
      maxSlotDuration = maxTaxonomyDuration.duration;
    }
  }

  const busySlotsResponse = {
    taxonomyId: taxonomyIDs && taxonomyIDs[0],
    slots_size: maxSlotDuration > 0 ? maxSlotDuration : 0,
    maxSlotCapacity: 1,
    daysOff,
    excludedResources,
    days: _.filter(_.map(cracSlots, function(cracSlot) {
      const { date } = cracSlot;

      const dayBounds = getDayBoundsFromTimetable(date, businessTimetable, businessTimetableCache);
      if (!dayBounds) {
        cracSlot.resources.forEach(function(resourceId) {
          daysOff.push({
            date: date,
            resource_id: resourceId,
          });
        });
        return null;
      }

      const slots =  getCrunchSlotsFromCrac(cracSlot, date, dayBounds.start, dayBounds.end, maxSlotDuration);

      if (cracSlot.excludedResources) {
        cracSlot.excludedResources.forEach(
          resourceId => excludedResourcesCountMap[resourceId] = (excludedResourcesCountMap[resourceId] || 0) + 1
        );
      }

      visitedDaysCount++;

      return {
        date,
        start_time: slots.start_time || dayBounds.start_time,
        end_time: slots.end_time || dayBounds.end_time,
        slots,
      };
    })),
  };

  // Post processing of excludedResources
  for (const resourceId in excludedResourcesCountMap) {
    if (Object.prototype.hasOwnProperty.call(excludedResourcesCountMap, resourceId)) {
      if (excludedResourcesCountMap[resourceId] >= visitedDaysCount) {
        excludedResources.push(resourceId);
      }
    }
  }

  return busySlotsResponse;
}
