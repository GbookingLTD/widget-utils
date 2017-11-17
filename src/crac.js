'use strict';

import _ from 'lodash';
import moment from 'moment';


const SLOT_SIZE = 5;
const VECTOR_SIZE = 24 * 60 / SLOT_SIZE

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

function getDayBoundsFromCracSlot(date,slot){
  let allDayBounds = null;
  const bitmask = cracValueToBits(slot.bitset);
  var firstActiveBit = bitmask.length;
  var daySize = 24 * 60 / SLOT_SIZE;
  var lastActiveBit = bitmask.length - daySize;
  for (var ii=bitmask.length - 1; ii > bitmask.length - 24 * 60 /SLOT_SIZE; ii--){
    if ( bitmask[ii] == 1 &&  firstActiveBit ==  bitmask.length){
      firstActiveBit = ii;
    }
    if ( bitmask[ii] == 1){
      lastActiveBit = ii;
    }
  }
  if (firstActiveBit != bitmask.length){
    allDayBounds = {};
    allDayBounds.start = (bitmask.length -1 - firstActiveBit) * SLOT_SIZE;
    allDayBounds.start_time = moment(date).add(allDayBounds.start,'minutes').toISOString();
    allDayBounds.end = (bitmask.length - lastActiveBit) * SLOT_SIZE;
    allDayBounds.end_time = moment(date).add(allDayBounds.end,'minutes').toISOString();
  }
  console.log(bitmask);
  return allDayBounds;
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

  var bitmask = cracValueToBits(cracSlot.bitset);
  var bitmaskTaxonomy = cracValueToBits(cracSlot.taxonomyBitset ||"");
  if (bitmaskTaxonomy.indexOf(0) > -1){
    for (var i=0; i< bitmask.length; i++){
      bitmask[i] =bitmask[i] && bitmaskTaxonomy[i] 
    }
  }
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
    var bit = bitmask[bitIndex];
    const minutes = ii * SLOT_SIZE;
  

  
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

function resourceTaxonomyDuration(businessWokrer, businessTaxonomy) {
  var duration = businessTaxonomy.duration;
  if (businessWokrer.taxonomyLevels && businessWokrer.taxonomyLevels.length > 0) {
    var taxonomyLevel = _.find(businessWokrer.taxonomyLevels, { id: businessTaxonomy.id });
    if (taxonomyLevel) {
      var additionalDuration = _.find(businessTaxonomy.additionalDurations, { level: taxonomyLevel.level });
      if (additionalDuration && additionalDuration.duration) {
        duration = additionalDuration.duration;
      }
    }
  }
  return duration;
}

function getServiceDurationByWorker(busienssResources, businessTaonomies) {
  var taxonomyDuration = {};
  businessTaonomies.forEach(function (t) {
    var businessTaxonomy = _.find(businessTaonomies, { id: t.id });
    taxonomyDuration[t.id] = {};
    busienssResources.forEach(function (r) {
      var worker = _.find(busienssResources, { id: r.id });
      taxonomyDuration[t.id][r.id] = resourceTaxonomyDuration(worker, t);
    });
  });
  return taxonomyDuration;
}

function getSlotDurationByWorker(ServiceDurationByWorker, taxonomies, resources) {
  var duration = {};
  resources.forEach(function (r) {
    duration[r] = 0;
    taxonomies.forEach(function (t) {
      duration[r] += ServiceDurationByWorker[t][r];
    });
  });
  return duration;
}

function getRoomCapacityByService(taxonomyTreeCapacity, taxonomiesRooms, taxonomies) {
  var capacity = {};
  taxonomiesRooms.forEach(function (t) {
    var treeCpacity = _.find(taxonomyTreeCapacity, { parent_id: t.room });
    var tCapacity = treeCpacity && treeCpacity.capacity ? treeCpacity.capacity : 0;
    capacity[t.taxonomy] = tCapacity;
  });
  return capacity;
}

function getBitSetsFromCracSlots(cracSlot, roomCapacityByService, taxonomies, resources, taxonomiesRooms) {
  var bitSets = {};
  bitSets.resources = {};
  bitSets.rooms = {};
  resources.forEach(function (r) {
    var cracResource = _.find(cracSlot.resources, { resourceId: r });
    if (cracResource) {
      bitSets.resources[r] = cracValueToBits(cracResource.bitset);
    } else {
      bitSets.resources[r] = initBusyVector();
    }
  });

  taxonomies.forEach(function (tId) {
    var capacity = roomCapacityByService[tId];
    var room = _.find(taxonomiesRooms, { taxonomy: tId });
    if (room && !bitSets.rooms[roomId]) {
      var roomId = room.room;
      bitSets.rooms[roomId] = [];
      for (var i = 0; i < capacity; i++) {
        var cracRoom = _.find(cracSlot.rooms, { roomId: roomId + "_" + i });
        if (cracRoom) {
          bitSets.rooms[roomId][i] = cracValueToBits(cracRoom.bitset);
        } else {
          bitSets.rooms[roomId][i] = initFreeVector();
        }
      }
    }
  });
  return bitSets;
}

function getServiceRoomVector(workerBitSets, workerId, roomsBitSets, totalDuration, serviceDuration, resources, taxonomies) {
  var workerFree, roomFree;
  var finalVector = initBusyVector();
  for (var i = 0; i < workerBitSets.length; i++) {
    workerFree = checkFree(workerBitSets, i, totalDuration);
    roomFree = true;
    if (roomsBitSets.length > 0){
      roomFree = false;  
    }
    for (var j = 0; j < roomsBitSets.length; j++) {
      roomFree = roomFree || checkFree(roomsBitSets[j], i, serviceDuration[workerId]);
    }
    finalVector[i] = roomFree && workerFree;
  }
  return finalVector;
}

function taxonomyCombo(input){
  var permArr = [],
    usedChars = [];

  function permute(input) {
    var i, ch;
    for (i = 0; i < input.length; i++) {
      ch = input.splice(i, 1)[0];
      usedChars.push(ch);
      if (input.length == 0) {
        permArr.push(usedChars.slice());
      }
      permute(input);
      input.splice(i, 0, ch);
      usedChars.pop();
    }
    return permArr;
  };
  return permute(input);
}

function getRoomDurations (taxonomiesRooms,resourceId,serviceDurationByWorker){
  var rooms = [];
  taxonomiesRooms.forEach(function(room){
    var duration = serviceDurationByWorker[room.taxonomy][resourceId];
    var index = _.indexOf(rooms,{id:toom.room})
    if (index = -1){
      rooms.push({id:room.room,duration:duration})
    } else {
      rooms[index].duration += duration;
    }
  })
  return duration;
}

function checkSlotTaxonomyCombo(index,serviceRoomVectors,taxonomyCombo,resourceId,serviceDurationByWorker){
  var duration, vector;
  var bit = true;
  var calculatedIndex = index;
  for (var i=0; i < taxonomyCombo.length; i++){
    duration = serviceDurationByWorker[taxonomyCombo[i]][resourceId];
    calculatedIndex = calculatedIndex + i * duration / SLOT_SIZE;
    bit =  bit&& serviceRoomVectors[taxonomyCombo[i]][resourceId][calculatedIndex];
  }
  return bit ? 1: 0;
}

function getWorkerVector(serviceRoomVectors, resourceId, serviceDurationByWorker, taxonomies, taxonomiesRooms) {
  var rooms = [];
  taxonomiesRooms.forEach(function(t){
    if (rooms.indexOf(t.room) == -1){
      rooms.push(t.room);
    }
  })

  var combinations = taxonomyCombo(taxonomies);
  var vector = initBusyVector();
  for (var i=0 ; i< combinations.length; i++){
    for (var j=0;j<vector.length;j++){
      vector[j] = vector[j] || checkSlotTaxonomyCombo(j,serviceRoomVectors,combinations[i],resourceId,serviceDurationByWorker);
    }
  }
  return vector;
}

function calcResourceSlots(resourceVector) {
  var resourceSlots = [];
  for (var i = 0; i< resourceVector.length ; i++){
    if (resourceVector[i]){
      resourceSlots.push({ time: i*SLOT_SIZE, duration: SLOT_SIZE , space_left: 1 ,discount:10});
    }
  }
  return resourceSlots;
}

function calExcludedResource(resources, slots) {
  return [];
}

function mergeUniqueSlots(allSlots, newSlots) {
  var uniqueSlots = allSlots;
  newSlots.forEach(function (slot) {
    if (!_.find(uniqueSlots, { time: slot.time })) {
      uniqueSlots.push(slot);
    }
  });
  return uniqueSlots;
}

function initFreeVector() {
  var set = [];
  for (var i = 0; i < VECTOR_SIZE; i++) {
    set[i] = 1;
  }
  return set;
}

function initBusyVector() {
  var set = [];
  for (var i = 0; i < VECTOR_SIZE; i++) {
    set[i] = 0;
  }
  return set;
}

function checkFree(bistSet, index, duration) {
  var bits = duration / SLOT_SIZE;
  for (var i = index; i < index + bits; i++) {
    if (bistSet[i] == 0) {
      return 0;
    }
  }
  return 1;
}

function fixBitSetAccordingToDuration(bitset,duration){
  var calculatedBitSet = [];
  var durationInSlots = duration / SLOT_SIZE;
  for (var i=0; i< bitset.length;i++){
    calculatedBitSet[i] = isBitAvailable(bitset,i,durationInSlots);
  }
  return calculatedBitSet;
}

function setAnd (setA,setB){
  var unifiedSet = [];
  for (var i=0; i< setA.length; i++){
      unifiedSet[i] = setA[i] && setB[i] 
  }
  return unifiedSet;
}

function setUnion (setA,setB){
  var unifiedSet = [];
  for (var i=0; i< setA.length; i++){
      unifiedSet[i] = setA[i] || setB[i] 
  }
  return unifiedSet;
}

function getCalculatedRoomVector(cracSlot,roomId,capacity,taxonomyId,duration){
  var freeSet = initFreeVector();
  if (capacity = 0){
    return freeSet;
  }
  var busySet = initBusyVector();
  var roomSet;
  if (capacity > 0){
    for (var i=0 ; i< capacity ; i++){
      //cracValueToBits
      roomFromCrac = _.find(cracSlot.room,{room_id:roomId+"_"+i})
      if (roomFromCrac){
        roomSet = fixBitSetAccordingToDuration(cracValueToBits(roomFromCrac.bitset),duration);
        busySet = setUnion(roomSet,busySet);
      }
    }
  }
  return busySet;
}

export function prepareSlots(cracResult, business, taxonomies, resources, taxonomiesRooms) {

  var excludedResource = [];
  var finalSlots = {};
  var businessData = business;

  finalSlots.days = [];
  finalSlots.excludedResource = [];

  var businessTaxonomies = _.filter(business.taxonomies, function (t) {
    return taxonomies.indexOf(t.id) > -1;
  });
  var busniessWorkers = _.filter(business.resources, function (t) {
    return resources.indexOf(t.id) > -1;
  });

  var serviceDurationByWorker = getServiceDurationByWorker(busniessWorkers, businessTaxonomies);
  var totalServicesDurationByWorker = getSlotDurationByWorker(serviceDurationByWorker, taxonomies, resources);
  var roomCapacityByService = getRoomCapacityByService(business.taxonomy_tree_capacity, taxonomiesRooms, taxonomies);

  cracResult.forEach(function (cracSlot) {
    var bitSets = getBitSetsFromCracSlots(cracSlot, roomCapacityByService, taxonomies, resources, taxonomiesRooms);
    var daySlots = {};
    daySlots.date = moment(cracSlot.date).utc().startOf('day').toISOString();
    daySlots.resources = [];
    daySlots.slots = [];
    var serviceRoomVectors = {};
    var finalWorkersVector = {};

    taxonomies.forEach(function (tId) {
      serviceRoomVectors[tId] = {};
      var room = _.find(taxonomiesRooms, { taxonomy: tId });
      var roomBitSet = room ? bitSets.rooms[room.room] : [];
      resources.forEach(function (rId) {
        serviceRoomVectors[tId][rId] = getServiceRoomVector(bitSets.resources[rId], rId, roomBitSet, totalServicesDurationByWorker[rId], serviceDurationByWorker[tId], resources, taxonomies);
      });
    });

    resources.forEach(function (rId) {
      finalWorkersVector[rId] = getWorkerVector(serviceRoomVectors, rId, serviceDurationByWorker, taxonomies,taxonomiesRooms);
    });

    resources.forEach(function (rId) {
      var resourceSlots = calcResourceSlots(finalWorkersVector[rId]);
      daySlots.resources.push({ id: rId, slots: resourceSlots });
      var mergedSlots = mergeUniqueSlots(daySlots.slots, resourceSlots);
      daySlots.slots = _.sortBy(mergedSlots, function(o) { return o.time; })
    });
    daySlots.available = daySlots.slots.length > 0;
    finalSlots.days.push(daySlots);
  });
  finalSlots.excludedResource = calExcludedResource(resources, finalSlots.days);
  return finalSlots;
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

      var dayBounds = getDayBoundsFromAllTimetables(date, resourceTimetables);

      if (!dayBounds){
        dayBounds = getDayBoundsFromCracSlot(date,cracSlot);
      }

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
