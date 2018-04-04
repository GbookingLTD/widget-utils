'use strict';

import _ from 'lodash';
import moment from 'moment';


let SLOT_SIZE = 5;
const VECTOR_SIZE = 24 * 60 / SLOT_SIZE
const FIRST_DAY_OF_WEEK = 1;

// Convert minutes to date in ISO format
function minutesToDate(date, minutes) {
  return moment.utc(date).startOf('day').add(minutes, 'minutes').toISOString();
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

function getEvenOddType (startPeriod, startTime) {
  if(startPeriod == 'month') {
    return startTime.date() % 2 ? 'odd' : 'even';
  }
  if(startPeriod == 'week') {
    let firstDay = FIRST_DAY_OF_WEEK;
    let correction = firstDay === 0 ? 1 : 0,
        dayNum = startTime.day();
    dayNum = dayNum === 0 && firstDay === 1 ? 7 : dayNum;
    var isOdd = !!((dayNum + correction) % 2);
    return !isOdd ? 'even' : 'odd';
  }
}

function getDayOffNum (daysToSub) {
  let dayOffNum = 7 - Math.abs(FIRST_DAY_OF_WEEK - daysToSub);
  return dayOffNum == 7 ? 0 : dayOffNum;
}

function getEvenOddTimetableFrames (date,timetable) {
  let dayNum = date.day(),
      type = getEvenOddType(timetable.startPeriod, date);

  if ((!timetable.workAtFirstDayOff && dayNum == getDayOffNum(2)) ||
      (!timetable.workAtSecondDayOff && dayNum == getDayOffNum(1))) {
    return [];
  } else {
    return timetable[type];
  }
}

function combineFrames (dayScheduleArray) {
  var start = 1440,end = 0;
  dayScheduleArray.forEach(function(f){
    if (f.start < start) {
      start = f.start;
    }
    if (f.end > end) {
      end = f.end;
    }
  })
  return {start:start,end:end};
}

function getDayBoundsFromEvenOddTimetable (date, timetable){
  var dateMoment = moment(date);
  var dayScheduleArray = getEvenOddTimetableFrames(dateMoment,timetable);
  var daySchedule = combineFrames (dayScheduleArray);
  var dayBounds = getDayBoundsFromShedule(daySchedule, dateMoment);
  return dayBounds;
}
function getDayBoundsFromCracSlot(date,slot){
  let allDayBounds = null;
  const bitmask = cracValueToBits(slot.bitset);
  var firstActiveBit = bitmask.length;
  var daySize = 24 * 60 / SLOT_SIZE;
  var lastActiveBit = bitmask.length - daySize;
  for (var ii=bitmask.length - 1; ii >= bitmask.length - 24 * 60 /SLOT_SIZE; ii--){
    if ( bitmask[ii] == 1 &&  firstActiveBit ==  bitmask.length){
      firstActiveBit = ii;
    }
    if ( bitmask[ii] == 1){
      lastActiveBit = ii;
    }
  }
  if ( (firstActiveBit != bitmask.length-1) || (firstActiveBit == bitmask.length-1 && lastActiveBit > 1)){
    allDayBounds = {};
    allDayBounds.start = (bitmask.length -1 - firstActiveBit) * SLOT_SIZE;
    allDayBounds.start_time = moment(date).add(allDayBounds.start,'minutes').toISOString();
    if (lastActiveBit == 1){
      allDayBounds.end = bitmask.length * SLOT_SIZE;
    } else {
      allDayBounds.end = (bitmask.length - lastActiveBit) * SLOT_SIZE;
    }
    allDayBounds.end_time = moment(date).add(allDayBounds.end,'minutes').toISOString();
  }
  return allDayBounds;
}
// This function takes day bounds from getDayBoundsFromTimetable for every timetables
// and computes min-start and max-end bounds from all given timetables.
// It allows us to show correct day bounds for 'any free worker' option.
function getDayBoundsFromAllTimetables(date, timetablesDefult,timetablesEvenOdd,timeTableType) {
  let allDayBounds = null;
  timeTableType = timeTableType ||'DEFAULT';
  var timetables = timeTableType == 'EVENODD' ? timetablesEvenOdd : timetablesDefult;
  timetables.forEach(tt => {
    var dayBounds
    if (timeTableType == 'EVENODD'){
      dayBounds = getDayBoundsFromEvenOddTimetable(date, tt);
    } else {
      dayBounds = getDayBoundsFromTimetable(date, tt);
    }

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

/**
   * return excution time of taxonomy by specific worker
   * @param {Object} businessWorker 
   * @param {Object} businessTaxonomy 
   */
  function resourceTaxonomyDuration(businessWorker, businessTaxonomy) {
    var duration = businessTaxonomy.duration;
    if (businessWorker.taxonomyLevels && businessWorker.taxonomyLevels.length > 0) {
      var taxonomyLevel = _.find(businessWorker.taxonomyLevels, { id: businessTaxonomy.id });
      if (taxonomyLevel) {
        var additionalDuration = _.find(businessTaxonomy.additionalDurations, { level: taxonomyLevel.level });
        if (additionalDuration && additionalDuration.duration) {
          duration = additionalDuration.duration;
        }
      }
    }
    return duration;
  }

  /**
   * return map of taxonomies, and foreach taxonomy map of resources and durations
   * @param {Array} businessResources 
   * @param {Array} businessTaxonomies 
   */
  function getServiceDurationByWorker(businessResources, businessTaxonomies) {
    var taxonomyDuration = {};
    businessTaxonomies.forEach(function (t) {
      taxonomyDuration[t.id] = {};
      businessResources.forEach(function (r) {
        taxonomyDuration[t.id][r.id] = resourceTaxonomyDuration(r, t);
      });
    });
    return taxonomyDuration;
  }

  /**
   * return map of resources each resource the total duaration to execute all taxonomies
   * @param {*} ServiceDurationByWorker 
   * @param {*} taxonomies 
   * @param {*} resources 
   */
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

  /**
   * excute the capacity of each taxonomy from request Crac.GetRoomsFromTaxonomies
   * @param {Object} taxonomyTreeCapacity 
   * @param {Object} taxonomiesRooms 
   */
  function getRoomCapacityByService(taxonomyTreeCapacity, taxonomiesRooms) {
    var capacity = {};
    taxonomiesRooms.forEach(function (t) {
      var treeCapacity = _.find(taxonomyTreeCapacity, { parent_id: t.room });
      var tCapacity = treeCapacity && treeCapacity.capacity ? treeCapacity.capacity : 0;
      capacity[t.taxonomy] = tCapacity;
    });
    return capacity;
  }

  /**
   * convert crac bitset response into bitset vectors
   * @param {Object} cracSlot 
   * @param {Object} roomCapacityByService 
   * @param {Array} taxonomies 
   * @param {Array} resources 
   * @param {Array} taxonomiesRooms 
   */
  function getBitSetsFromCracSlots(cracSlot, roomCapacityByService, taxonomies, resources, taxonomiesRooms) {
    var bitSets = {};
    bitSets.resources = {};
    bitSets.rooms = {};
    resources.forEach(function (r) {
      var cracResource = _.find(cracSlot.resources, { resourceId: r });
      if (cracResource) {
        bitSets.resources[r] = cracValueToBits(cracResource.bitset).reverse();
      } else {
        bitSets.resources[r] = initBusyVector();
      }
    });

    taxonomies.forEach(function (tId) {
      var capacity = roomCapacityByService[tId];
      var room = _.find(taxonomiesRooms, { taxonomy: tId });
      if (room && !bitSets.rooms[room.room]) {
        var roomId = room.room;
        bitSets.rooms[roomId] = [];
        for (var i = 0; i < capacity; i++) {
          var cracRoom = _.find(cracSlot.rooms, { roomId: roomId + "_" + i });
          if (cracRoom) {
            bitSets.rooms[roomId][i] = cracValueToBits(cracRoom.bitset).reverse();
          } else {
            bitSets.rooms[roomId][i] = initFreeVector();
          }
        }
      }
    });
    return bitSets;
  }

  /**
   * return vector:true mean the resource is free for total duration of all taxonomies and rooms are available for these taxonomies
   * @param {Array} workerBitSets 
   * @param {string} workerId 
   * @param {Array} roomsBitSets 
   * @param {Int} totalDuration 
   * @param {Int} serviceDuration 
   * @param {String} resources 
   * @param {Array} taxonomies 
   */
  function getServiceRoomVector(workerBitSets, workerId, roomsBitSets, totalDuration, serviceDuration, resources, taxonomies) {
    var workerFree, roomFree;
    var finalVector = initBusyVector();
    for (var i = 0; i < workerBitSets.length; i++) {
      workerFree = checkFree(workerBitSets, i, totalDuration);
      if (workerFree == 1){
        roomFree = true;
        if (roomsBitSets.length > 0){
          roomFree = false;  
        }
        for (var j = 0; j < roomsBitSets.length; j++) {
          roomFree = roomFree || checkFree(roomsBitSets[j], i, serviceDuration[workerId]);
        }
        finalVector[i] = roomFree;
      } 
    }
    return finalVector;
  }
  
  /**
   * return all combination of setting elements in array 
   * example: taxonomyCombo(["a","b","c"]) return
   * [["a", "b", "c"],["a", "c", "b"],["b", "a", "c"],
   * ["b", "c", "a"],["c", "a", "b"],["c", "b", "a"]]
   * @param {Array} input 
   */
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

  /**
   * 
   * Check if serious of taxonomies can be executed by specific worker at specfic bit
   * 
   * @param {int} index 
   * @param {Object} serviceRoomVectors 
   * @param {Array} taxonomyCombo 
   * @param {String} resourceId 
   * @param {Object} serviceDurationByWorker 
   */
  function checkSlotTaxonomyCombo(index,serviceRoomVectors,taxonomyCombo,resourceId,serviceDurationByWorker){
    var duration, vector;
    var bit = true;
    var calculatedIndex = index;
    
    duration = serviceDurationByWorker[taxonomyCombo[0]][resourceId];
    bit =  bit&& serviceRoomVectors[taxonomyCombo[0]][resourceId][calculatedIndex];

    for (var i=1; i < taxonomyCombo.length; i++){
      calculatedIndex = calculatedIndex + i * parseInt(duration / SLOT_SIZE);
      bit =  bit&& serviceRoomVectors[taxonomyCombo[i]][resourceId][calculatedIndex];
      duration = serviceDurationByWorker[taxonomyCombo[i]][resourceId];
    }
    return bit ? 1: 0;
  }

  /**
   * 
   * return resource vector; bit true when atleast 1 combination of taxonomy can be done
   * for example: in case of padicure and manicure service in request, true grante that worker can execute the
   * services by doing padicure first or manicure first
   * 
   * @param {Object} serviceRoomVectors 
   * @param {String} resourceId 
   * @param {Object} serviceDurationByWorker 
   * @param {Array} taxonomies 
   * @param {Array} taxonomiesRooms 
   */
  function getWorkerVector(serviceRoomVectors, resourceId, serviceDurationByWorker, taxonomies, taxonomiesRooms) {
    var rooms = [];
    taxonomiesRooms.forEach(function(t){
      if (rooms.indexOf(t.room) == -1){
        rooms.push(t.room);
      }
    })

    var combinations = taxonomyCombo(taxonomies);
    var vector = initBusyVector();
    for (var j=0;j<vector.length;j++){
      for (var i=0 ; i< combinations.length; i++){
        vector[j] = vector[j] || checkSlotTaxonomyCombo(j,serviceRoomVectors,combinations[i],resourceId,serviceDurationByWorker);
        if (vector[j] == 1){
          break;
        }
      }
    }
    return vector;
  }

  /**
   * create widget solts from bitset
   * @param {bitset} resourceVector 
   */
  function calcResourceSlots(resourceVector) {
    var resourceSlots = [];
    for (var i = 0; i< resourceVector.length ; i++){
      if (resourceVector[i]){
        resourceSlots.push({ time: i*SLOT_SIZE, duration: SLOT_SIZE , space_left: 1 ,discount:10});
      }
    }
    return resourceSlots;
  }
  /**
   * return array of excluded resources 
   * retource excluded in case he dont have any free slot in request dates
   * @param {Array} resources 
   * @param {Object} slots 
   */
  function calExcludedResource(resources,excludedHash) {
    var excludedResources = [];
    resources.forEach(function(rId){
      if (!excludedHash[rId]){
        excludedResources.push(rId)
      }
    })
    return excludedResources;
  }
  

  /**
   * intialize bitset with 1 in all bits
   */
  function initFreeVector() {
    var set = [];
    for (var i = 0; i < VECTOR_SIZE; i++) {
      set[i] = 1;
    }
    return set;
  }

  /**
   * intialize bitset with 0 in all bits
   */
  function initBusyVector() {
    var set = [];
    for (var i = 0; i < VECTOR_SIZE; i++) {
      set[i] = 0;
    }
    return set;
  }

  /**
   * check of bitset has serious of true from index to fit duration 
   * @param {bitset} bistSet 
   * @param {int} index 
   * @param {int} duration 
   */
  function checkFree(bistSet, index, duration) {
    var bits = parseInt(duration / SLOT_SIZE);
    for (var i = index; i < index + bits; i++) {
      if (bistSet[i] == 0) {
        return 0;
      }
    }
    return 1;
  }
  
  /**
   * And operation by bit between 2 sets
   * 
   * @param {*bitset} setA 
   * @param {*bitset} setB 
   */
  function setAnd (setA,setB){
    var unifiedSet = [];
    for (var i=0; i< setA.length; i++){
        unifiedSet[i] = setA[i] && setB[i] 
    }
    return unifiedSet;
  }
  
  /**
   * OR operation by bit between 2 sets
   * 
   * @param {*bitset} setA 
   * @param {*bitset} setB 
   */
  function setUnion (setA,setB){
    var unifiedSet = [];
    for (var i=0; i< setA.length; i++){
        unifiedSet[i] = setA[i] || setB[i] 
    }
    return unifiedSet;
  }
  
  /**
   *  Return slots of each resource and the union slot for any available view
   * 
   * @param {Object} cracResult 
   * @param {Object} business 
   * @param {Array} taxonomies 
   * @param {Array} resources 
   * @param {Array} taxonomiesRooms 
   */
  export function prepareSlots(cracResult, business, taxonomies, resources, taxonomiesRooms) {
  
    var excludedResource = [];
    var finalSlots = {};
    var businessData = business;

    finalSlots.days = [];
    finalSlots.excludedResource = [];

    var businessTaxonomies = _.filter(business.taxonomies, function (t) {
      return t.active && taxonomies.indexOf(t.id) > -1;
    });
    var businessWorkers = _.filter(business.resources, function (r) {
      return r.status == 'ACTIVE' && resources.indexOf(r.id) > -1;
    });

    var serviceDurationByWorker = getServiceDurationByWorker(businessWorkers, businessTaxonomies);
    var totalServicesDurationByWorker = getSlotDurationByWorker(serviceDurationByWorker, taxonomies, resources);
    var roomCapacityByService = getRoomCapacityByService(business.taxonomy_tree_capacity, taxonomiesRooms);
    var availableResoueceHash = {};
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

      var anyAvailableVector = initBusyVector()
      resources.forEach(function (rId) {
        finalWorkersVector[rId] = getWorkerVector(serviceRoomVectors, rId, serviceDurationByWorker, taxonomies,taxonomiesRooms);
        var resourceSlots = calcResourceSlots(finalWorkersVector[rId]);
        daySlots.resources.push({ id: rId, slots: resourceSlots });
        if (resourceSlots.length>0){
          availableResoueceHash[rId] = true;
        }
        anyAvailableVector = setUnion(anyAvailableVector,finalWorkersVector[rId])
      });
      daySlots.slots = calcResourceSlots(anyAvailableVector)
      daySlots.available = daySlots.slots.length > 0;
      finalSlots.days.push(daySlots);
    });

    finalSlots.excludedResource = calExcludedResource(resources,availableResoueceHash);
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
  const resourceEvenOddTimeTable = [];
  const timetableType = business.backoffice_configuration && business.backoffice_configuration.resourceTimetableType ? business.backoffice_configuration.resourceTimetableType : 'DEFAULT';
  business.resources.forEach(rr => {
    if (resourceIds.indexOf(rr.id) < 0) {
      return;
    }
    if (timetableType == 'EVENODD'){
      resourceEvenOddTimeTable.push(rr.evenOddTimetable);
    } else {
      resourceTimetables.push(rr.timetable && rr.timetable.active === true ? rr.timetable : businessTimetable);
    }
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
      var dayBounds;
      //dayBounds = getDayBoundsFromAllTimetables(date, resourceTimetables,resourceEvenOddTimeTable,timetableType);
      dayBounds = getDayBoundsFromCracSlot(date,cracSlot);
      

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

export function setSlotSize (slotSize){
  SLOT_SIZE = slotSize;
}