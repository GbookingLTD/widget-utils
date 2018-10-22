"use strict";

/*
 * Classes for sorting workers in taxonomy context and without.
 * It uses on server-side and on client-side.
 * 
 * // in common resource list
 * var sorter = new WeightIndex();
 * 
 * // in taxonomy context by max_free
 * var sorter = new MostFreeWeightIndex(maxFreeCracData);
 *
 * // in taxonomy context by workload
 * var sorter = new WorkloadWeightIndex(workloadCracData);
 * 
 * ...
 * $scope.workers = getSortedWorkers(workers, sorter);
 */

import _ from 'lodash';

/**
 * Класс для сортировки без контекста услуги, а так же базовый класс для остальных индексов.
 */
export class WeightIndex {
  constructor(data) {
    this._index = null;
    if (data) this.resetIndex(data);
  }
  
  resetIndex(data) {
    this._index = this._parseIndex(data);
  }
  
  getIndex() {
    return this._index;
  }
  
  _parseIndex(data) {
    return data;
  }
}

export class WorkloadWeightIndex extends WeightIndex {
  constructor(cracData, dir) {
    super(null);
    this.direction = dir || "DESC";
    this.resetIndex(cracData);
  }
  
  _parseIndex(cracData) {
    let weights = cracData.weights;
    let sortCriteria;
    switch (this.direction) {
      case "ASC":
        sortCriteria = (w) => w.weight;
        break;
      case "DESC":
        sortCriteria = (w) => 0x0FFFFFFF - w.weight;
        break;
      default:
        throw Error("Wrong direction " + this.direction);
    }

    let index = 0;
    return _(weights).sortBy(sortCriteria).reduce(function (ret, item) {
      item.index = ++index;
      ret[item.resource] = item;
      return ret;
    }, {});
  }
}

export class MostFreeWeightIndex extends WeightIndex {
  constructor(cracData) {
    super(cracData);
  }
  
  _parseIndex(cracData) {
    let freeDates = cracData.weights;
    let sortCriteria = (item) => {
        if (item.date === null || item.date === MostFreeWeightIndex.ZeroDate) {
          return Number.MAX_SAFE_INTEGER;
        }
        return Date.parse(item.date);
    };
  
    let index = 0;
    return _(freeDates).sortBy(sortCriteria).reduce(function(ret, item) {
      item.index = ++index;
      ret[item.resource] = item;
      return ret;
    }, {});
  }
}

MostFreeWeightIndex.ZeroDate = "0001-01-01T00:00:00Z";

/**
 * General algorithm for workers sorting.
 * 
 * @param {Array<{id, order}>} workers
 * @param {WeightIndex} index
 * @return {*}
 */
export function getSortedWorkers(workers, index) {
  let weights = index.getIndex();
  // use sorting by "order" worker property by default
  if (weights === null) return _.sortBy(workers, (res) => res.order);
  
  let indexOfNotWeights = workers.length;
  return _.sortBy(workers, (res) => weights[res.id] ? weights[res.id].index : ++indexOfNotWeights);
}
