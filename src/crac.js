'use strict';

import _ from 'lodash';
import moment from 'moment';


const SLOT_SIZE = 5;

// Convert minutes to date in ISO format
function minutesToDate(date, minutes) {
  return moment(date).startOf('day').add(minutes, 'minutes').utc().toDate().toString();
}


// Compute start_time/end_time according to given day schedule.
function getDayBoundsFromShedule(daySchedule, date) {
  return {
    start_time: minutesToDate(date, daySchedule.start),
    start: daySchedule.start,

    end_time: minutesToDate(date, daySchedule.end),
    end: daySchedule.end,
  };
}


// Return day bounds for day from timetable using cache.
function getDayBoundsFromTimetable(date, timetable) {
  if (timetable.active !== true) {
    return null;
  }

  const weekday = moment(date).weekday();

  let dayScheduleArray;
  switch(weekday) {
    case 7:
    case 0: dayScheduleArray = timetable.week.mon; break;
  	case 1: dayScheduleArray = timetable.week.tue; break;
  	case 2: dayScheduleArray = timetable.week.wed; break;
  	case 3: dayScheduleArray = timetable.week.thu; break;
  	case 4: dayScheduleArray = timetable.week.fri; break;
  	case 5: dayScheduleArray = timetable.week.sat; break;
    case 6: dayScheduleArray = timetable.week.sun; break;
    default: return null;
  }

  const daySchedule = dayScheduleArray && dayScheduleArray[0];
  if (daySchedule) {
    const dayBounds = getDayBoundsFromShedule(daySchedule, date);
    return dayBounds;
  }

  return null;
}


// This function takes day bounds from getDayBoundsFromTimetable for every timetables
// and computes min-start and max-end bounds from all given timetables.
// It allows us to show correct day bounds for 'any free worker' option.
function getDayBoundsFromAllTimetables(date, timetables) {
  let allDayBounds = null;

  timetables.forEach(tt => {
    const dayBounds = getDayBoundsFromTimetable(date, tt);

    if (!dayBounds) {
      return;
    } else if (!allDayBounds) {
      const { start_time, start, end_time, end } = dayBounds;
      allDayBounds = { start_time, start, end_time, end };
    } else {
      const { start_time, start, end_time, end } = dayBounds;
      if (allDayBounds.start > start) {
        allDayBounds.start = start;
        allDayBounds.start_time = start_time;
      }
      if (allDayBounds.end < end) {
        allDayBounds.end = end;
        allDayBounds.end_time = end_time;
      }
    }
  });

  return allDayBounds;
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
      available = true;
      if (currentSlot) {
        commitSlot();
      }
    } else if (bit === 0) {

      if (!currentSlot){
        makeSlot(minutes);
      } else{
        currentSlot.duration += SLOT_SIZE;
        // console.log('currentSlot.duration:', currentSlot && currentSlot.duration);

        if (currentSlot.duration >= maxSlotSize) {
          commitSlot();
          // console.info('separate by maxSlotSize', maxSlotSize);
          makeSlot(minutes);
        }
      }

    }
  }

  if (currentSlot) {
    // console.info('ensure last slot');
    commitSlot();
  }

  const busySlotsLength = busySlots.length;

  // Change start_time bounds according to near available time.
  if (bitmask[reverseOffset - startBitIndex] === 0) {
    let startSlot = busySlots[0];
    for (let ii = 1; ii < busySlotsLength; ii++) {
      let slot = busySlots[ii];
      if (startSlot.end === slot.start) {
        startSlot = slot;
      } else {
        break;
      }
    }

    if (startSlot) {
      start_time = moment.utc(date)
                    .startOf('day')
                    .add(startSlot.end, 'minutes')
                    .toISOString();
    }
  }

  // Change end_time bounds according to near available time.
  if (bitmask[reverseOffset - endBitIndex + 1] === 0) {
    let endSlot = busySlots[busySlotsLength - 1];
    for (let ii = busySlotsLength - 2; ii >= 0; ii--) {
      let slot = busySlots[ii];
      if (endSlot.start === slot.end) {
        endSlot = slot;
      } else {
        break;
      }
    }

    if (endSlot) {
      end_time = endSlot.time;
    }
  }

  return {
    available,
    busy: busySlots,
    start_time,
    end_time,
  };
}


// Special fix for `$scope.getEmptyDayLabel()` in `desktopwidget` app.
function isoDateForDayOff(date) {
  return moment(date).toISOString().replace('.000Z', 'Z');
}


/**
 * Presense CRAC data type as Crunch' Busy Slots
 *
 * Its need for soft migration from Crunch to CRAC
 *
 * @param  {CracBusySlots|Array<Object>} cracSlots CRAC response format
 * @return {CrunBusySlot|Object}           Crunch response format
 */
export function toBusySlots(cracSlots, business, taxonomyIDs, resourceIds = []) {
  const businessTimetable = business.general_info.timetable;
  const daysOff = [];
  const excludedResources = [];
  const excludedResourcesCountMap = {};
  let maxSlotDuration = -1;
  const resourceTimetables = [];

  business.resources.forEach(rr => {
    if (resourceIds.indexOf(rr.id) < 0) {
      return;
    }
    resourceTimetables.push((rr.timetable && rr.timetable.active === true) ?
                              rr.timetable :
                              businessTimetable
                            );
  });

  if (resourceTimetables.length < 1) {
    resourceTimetables.push(businessTimetable);
  }


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

  // const now = moment();

  function excludedResource(resource_id, date) {
    excludedResourcesCountMap[resource_id] = (excludedResourcesCountMap[resource_id] || 0) + 1;
    daysOff.push({ date, resource_id });
  }

  const busySlotsResponse = {
    taxonomyId: taxonomyIDs && taxonomyIDs[0],
    slots_size: maxSlotDuration > 0 ? maxSlotDuration : 0,
    maxSlotCapacity: 1,
    daysOff,
    excludedResources,
    days: _.map(cracSlots, function(cracSlot) {
      const { date } = cracSlot;

      const dayBounds = getDayBoundsFromAllTimetables(date, resourceTimetables);

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
        // if (now.isSame(date, 'day')) {
        //   const nowMinutes = now.hours() * 60 + now.minutes();
        //   dayStart = Math.ceil(nowMinutes / maxSlotDuration) * maxSlotDuration;
        //   dayStart = Math.min(dayStart, dayEnd);
        //   startTime = minutesToDate(now, dayStart);
        // }

        const slots =  getCrunchSlotsFromCrac(cracSlot, date, dayStart, dayEnd, maxSlotDuration);

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
