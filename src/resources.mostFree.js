import * as resources from './resources';

/*
 В данном файле реализована стратегия показа списка работников "most_free".
 Следите, чтобы сигнатуры функций из этого файла совпадали с сигнатурами функций из resources.js и наоборот.
 */

/**
 * 
 * @param {Object} workloadIndex
 * @param {Object} worker
 * @private
 */
export function _sortByWorkload(workloadIndex, worker) {
  return 10000000-workloadIndex[worker.id].weight;
}

/**
 * Подготавливает список работников и кабинетов для их отображения на виджете.
 *
 * @param $scope
 * @param workers
 * @param cabinets
 * @param {Object} options
 * @param {Object} options.workloadIndex
 * @param {Function} options.sortByFn
 * @param {Boolean} options.showInactiveWorkers
 * @param {Boolean} options.cabinetsEnabled
 */
export function prepareWorkers($scope, workers, cabinets, options) {
  options = options || {};
  options.sortByFn = _sortByWorkload.bind(null, options.workloadIndex);
  return resources.prepareWorkers($scope, workers, cabinets, options);
}

