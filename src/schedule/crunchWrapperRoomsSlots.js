"use strict";

import * as _ from 'lodash';
import moment from 'moment-timezone';
import {getRoomCapacityByService, getServiceRoomVector, getWorkerBookingVector} from "../rooms";
import {newBusyBitset, newFreeBitset, prepareBitset, setUnion} from "crac-utils/src";
import {getServiceDuration} from "../taxonomies";

let SLOT_SIZE = 5;
let VECTOR_SIZE = 24 * 60 / SLOT_SIZE;

export function setSlotSize (slotSize) {
  SLOT_SIZE = slotSize;
  VECTOR_SIZE = 24 * 60 / SLOT_SIZE;
}

/**
 * Return map of taxonomies, and foreach taxonomy map of resources and durations
 *
 * @param {Array} businessResources
 * @param {Array} businessTaxonomies
 */
function getServiceDurationByWorker(businessResources, businessTaxonomies) {
  let taxonomyDuration = {};
  businessTaxonomies.forEach(function (t) {
    taxonomyDuration[t.id] = {};
    businessResources.forEach(function (r) {
      taxonomyDuration[t.id][r.id] = getServiceDuration(r, t);
    });
  });
  return taxonomyDuration;
}

/**
 * Return map of resources each resource the total duration to execute all taxonomies
 *
 * @param {*} ServiceDurationByWorker
 * @param {*} taxonomies
 * @param {*} resources
 */
function getTotalDurationsByWorker(ServiceDurationByWorker, taxonomies, resources) {
  let duration = {};
  resources.forEach(function (r) {
    duration[r] = 0;
    taxonomies.forEach(function (t) {
      duration[r] += ServiceDurationByWorker[t][r];
    });
  });
  return duration;
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
  let bitSets = {};
  bitSets.resources = {};
  bitSets.rooms = {};
  resources.forEach(function (r) {
    let cracResource = _.find(cracSlot.resources, { resourceId: r });
    if (cracResource) {
      bitSets.resources[r] = prepareBitset(cracResource.bitset, SLOT_SIZE);
    } else {
      bitSets.resources[r] = newBusyBitset(SLOT_SIZE);
    }
  });

  taxonomies.forEach(function (tId) {
    let capacity = roomCapacityByService[tId];
    let room = _.find(taxonomiesRooms, { taxonomy: tId });
    if (room && !bitSets.rooms[room.room]) {
      let roomId = room.room;
      bitSets.rooms[roomId] = [];
      for (var i = 0; i < capacity; i++) {
        let cracRoom = _.find(cracSlot.rooms, { roomId: roomId + "_" + i });
        if (cracRoom) {
          bitSets.rooms[roomId][i] = prepareBitset(cracRoom.bitset, SLOT_SIZE);
        } else {
          bitSets.rooms[roomId][i] = newFreeBitset(SLOT_SIZE);
        }
      }
    }
  });
  return bitSets;
}

/**
 * Способ формирования слотов из вектора возможности записи (1 - можно записаться на это время
 * с учётом длительностей услуг и, возможно, других условий, 0 - нет возможности записи), при котором
 * слоты формируются с шагом равным размеру бита в CRAC векторе.
 *
 * @param {bitset} bookingVector
 */
function getGreedySlots(bookingVector) {
  var slots = [];
  for (var i = 0; i < bookingVector.length; i++) {
    if (bookingVector[i]) {
      slots.push({time: i * SLOT_SIZE, duration: SLOT_SIZE, space_left: 1, discount: 10});
    }
  }
  return slots;
}

/**
 * Return slots of each resource and the union slot for any available view.
 *
 * Данный метод используется для обработки запросов с использованием комнат.
 * Данный метод возвращает данные в формате crunch busySlots.
 *
 * @param {Object} cracResult
 * @param {Object} business
 * @param {Array} taxonomyIDs
 * @param {Array} resourceIDs
 * @param {Array} taxonomiesRooms
 */
export function prepareSlots(cracResult, business, taxonomyIDs, resourceIDs, taxonomiesRooms) {
  let finalSlots = {};
  finalSlots.days = [];
  finalSlots.excludedResource = [];

  let businessWorkers = _.filter(business.resources, function (r) {
    return r.status === 'ACTIVE' && resourceIDs.indexOf(r.id) > -1;
  });

  let businessTaxonomies = _.filter(business.taxonomies, function (t) {
    return t.active && taxonomyIDs.indexOf(t.id) > -1;
  });

  let serviceDurationByWorker = getServiceDurationByWorker(businessWorkers, businessTaxonomies);
  let totalServicesDurationByWorker = getTotalDurationsByWorker(serviceDurationByWorker, taxonomyIDs, resourceIDs);
  let roomCapacityByService = getRoomCapacityByService(business.taxonomy_tree_capacity, taxonomiesRooms);

  let isAvailableResource = {};
  cracResult.forEach(function (cracSlot) {
    let bitSets = getBitSetsFromCracSlots(cracSlot, roomCapacityByService, taxonomyIDs, resourceIDs, taxonomiesRooms);
    let daySlots = {};
    daySlots.date = moment(cracSlot.date).utc().startOf('day').toISOString();
    daySlots.resources = [];
    daySlots.slots = [];
    let serviceRoomVectors = {};

    taxonomyIDs.forEach(function (tId) {
      serviceRoomVectors[tId] = {};
      let room = _.find(taxonomiesRooms, { taxonomy: tId });
      let roomBitSet = room ? bitSets.rooms[room.room] : [];
      resourceIDs.forEach(function (rId) {
        serviceRoomVectors[tId][rId] = getServiceRoomVector(bitSets.resources[rId], rId, roomBitSet,
          totalServicesDurationByWorker[rId], serviceDurationByWorker[tId], SLOT_SIZE);
      });
    });

    let anyAvailableVector = newBusyBitset(SLOT_SIZE);
    resourceIDs.forEach(function (rId) {
      let workerBookingsVector = getWorkerBookingVector(serviceRoomVectors, rId, serviceDurationByWorker,
        taxonomyIDs, taxonomiesRooms, SLOT_SIZE);
      let resourceSlots = getGreedySlots(workerBookingsVector);
      daySlots.resources.push({ id: rId, slots: resourceSlots });
      if (resourceSlots.length > 0) {
        isAvailableResource[rId] = true;
      }
      anyAvailableVector = setUnion(anyAvailableVector, workerBookingsVector)
    });

    daySlots.slots = getGreedySlots(anyAvailableVector);
    daySlots.available = daySlots.slots.length > 0;
    finalSlots.days.push(daySlots);
  });

  finalSlots.excludedResource = resourceIDs.filter(function (rId) {
    return !isAvailableResource[rId];
  });

  return finalSlots;
}
