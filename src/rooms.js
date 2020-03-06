"use strict";

import _ from 'lodash';
import {buildBookingCRACVector, newBusyBitset, setUnion} from "crac-utils/src";

/**
 * Return vector:true mean the resource is free for total duration of all taxonomies and rooms are available for these taxonomies
 * 
 * Объединяем вектор возможности для записи работника со всеми векторами возможности для записи комнат.
 * Метод возвращает вектор, в котором 1 означает, что в данное время можно совершить запись.
 * Здесь используется жадный алгоритм обхода расписания.
 * 
 * @param {Array} workerBitset
 * @param {string} workerId
 * @param {Array} roomsBitSets
 * @param {Number} totalDuration
 * @param {Number} serviceDuration
 * @param {Number} cracVectorSlotSize
 */
export function getServiceRoomVector(workerBitset, workerId, roomsBitSets, totalDuration, serviceDuration, cracVectorSlotSize) {
  let unionBookingVector = buildBookingCRACVector(workerBitset, cracVectorSlotSize, totalDuration);
  for (let j = 0; j < roomsBitSets.length; j++) {
    let roomBookingVector = buildBookingCRACVector(roomsBitSets[j], cracVectorSlotSize, serviceDuration[workerId]);
    unionBookingVector = setUnion(unionBookingVector, roomBookingVector);
  }
  return unionBookingVector;
}

/**
 * Return all combination of setting elements in array
 * example: taxonomyCombo(["a","b","c"]) return
 * [["a", "b", "c"],["a", "c", "b"],["b", "a", "c"],
 * ["b", "c", "a"],["c", "a", "b"],["c", "b", "a"]]
 * @param {Array} input
 */
function taxonomyCombo(input) {
  let permArr = [],
    usedChars = [];

  function permute(input) {
    let i, ch;
    for (i = 0; i < input.length; i++) {
      ch = input.splice(i, 1)[0];
      usedChars.push(ch);
      if (input.length === 0) {
        permArr.push(usedChars.slice());
      }
      permute(input);
      input.splice(i, 0, ch);
      usedChars.pop();
    }
    return permArr;
  }
  return permute(input);
}

/**
 * Check if series of taxonomies can be executed by specific worker at specific bit.
 *
 * Получаем вектор возможности записи для переданной комбинации услуг.
 * 
 * @param {Object} serviceRoomVectors вектора возможности записи на работника для комбинации таксономий
 * @param {Array} taxonomyCombo
 * @param {String} resourceId
 * @param {Object} serviceDurationByWorker
 * @param {Number} cracVectorSlotSize
 * @return {Array<Number>}
 */
function buildTaxonomyComboBookingVector(serviceRoomVectors, taxonomyCombo, resourceId, serviceDurationByWorker, cracVectorSlotSize) {
  return buildSequenceBookingCRACVector(
    taxonomyCombo.map(taxonomyId => serviceRoomVectors[taxonomyId][resourceId]),
    taxonomyCombo.map(taxonomyId => serviceDurationByWorker[taxonomyId][resourceId]),
    cracVectorSlotSize
  );
}

/**
 * Return resource vector; bit true when atleast 1 combination of taxonomy can be done
 * for example: in case of padicure and manicure service in request, true grante that worker can execute the
 * services by doing padicure first or manicure first
 *
 * @param {Object} serviceRoomVectors
 * @param {String} resourceId
 * @param {Object} serviceDurationByWorker
 * @param {Array} taxonomies
 * @param {Array} taxonomiesRooms
 * @param {Number} cracVectorSlotSize
 */
export function getWorkerBookingVector(serviceRoomVectors, resourceId, serviceDurationByWorker, taxonomies, 
                                       taxonomiesRooms, cracVectorSlotSize) {
  // Получаем все перестановки таксономий
  let combinations = taxonomyCombo(taxonomies);
  
  // Для каждой комбинации таксономий получаем вектор возможности записи.
  // Объединяем эти вектора. Полученный вектор и будет искомым.
  let unionBookingVector = newBusyBitset(cracVectorSlotSize);
  for (let i = 0; i < combinations.length; i++) {
    let comboVector = buildTaxonomyComboBookingVector(serviceRoomVectors, combinations[i], resourceId, 
      serviceDurationByWorker, cracVectorSlotSize);
    unionBookingVector = setUnion(unionBookingVector, comboVector);
  }

  return unionBookingVector;
}

/**
 * Execute the capacity of each taxonomy from request Crac.GetRoomsFromTaxonomies
 * 
 * @param {Object} taxonomyTreeCapacity
 * @param {Object} taxonomiesRooms
 */
export function getRoomCapacityByService(taxonomyTreeCapacity, taxonomiesRooms) {
  let capacity = {};
  taxonomiesRooms.forEach(function (t) {
    let treeCapacity = _.find(taxonomyTreeCapacity, { parent_id: t.room });
    capacity[t.taxonomy] = treeCapacity && treeCapacity.capacity ? treeCapacity.capacity : 0;
  });
  return capacity;
}
