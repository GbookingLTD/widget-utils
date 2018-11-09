import _ from 'lodash';
import {getSortedWorkers} from './sortedWorkers';

/**
 * Убирает из списка тех работников, которых не нужно показывать в виджете.
 *
 * @param resources
 * @param businessData
 * @param options
 * @returns {[]}
 */
export function clearHiddenResources(resources, businessData, options) {
  options = options || {};
  const showInactiveWorkers = options.showInactiveWorkers || false;
  const showAllWorkers = businessData.business.widget_configuration.showAllWorkers;
  return resources.filter(function (resource) {
    return (showInactiveWorkers || resource.displayInWidget) &&
      (showAllWorkers || !resource.scheduleIsEmpty)
  });
}

/**
 * Выбираем только тех работников, которые выполяют указанную услугу (услуги).
 *
 * @param businessData
 * @param {Array<String>} services
 * @param options
 * @returns {[]}
 */
export function filterWorkersByTaxonomies(businessData, services, options) {
  if (!(services && services.length)) {
    console.warn("Services not passed in worker filter!");
    return [];
  }
  
  options = options || {};
  if (typeof options.clearHiddenResources === 'undefined') options.clearHiddenResources = true;

  let resources = businessData.business.resources;
  if (options.clearHiddenResources) {
    resources = clearHiddenResources(resources, businessData, options);
  }
  
  if (services.length > 1) {
    return resources.filter(function (resource) {
      // worker should execute all services
      let intersection = _.intersection(resource.taxonomies, services);
      return intersection && intersection.length === services.length;
    });
  }
  
  return resources.filter(function (resource) {
    return resource.taxonomies.indexOf('' + services[0]) !== -1;
  });
}

/**
 * Подготавливает список работников и кабинетов для их отображения на виджете.
 *
 * @param $scope
 * @param workers
 * @param cabinets
 * @param {Object} options
 * @param {Function} options.sortByFn
 * @param {Boolean} options.showInactiveWorkers
 * @param {Boolean} options.cabinetsEnabled
 */
export function prepareWorkers($scope, workers, cabinets, options) {
  options = options || {};
  options.sortByFn = options.sortByFn || null;
  options.showInactiveWorkers = options.showInactiveWorkers || false;
  options.cabinetsEnabled = options.cabinetsEnabled || false;

  let activeWorkers = options.showInactiveWorkers ? workers : _.filter(workers, {'status': 'ACTIVE'});
  let hasOrder = _.all(activeWorkers, 'order');

  let sortedWorkers;
  if (options.sortByFn) {
    sortedWorkers = _.sortBy(activeWorkers, options.sortByFn);
  } else if (options.weightIndex) {
    sortedWorkers = getSortedWorkers(workers, options.weightIndex);
  } else {
    sortedWorkers = _.sortBy(activeWorkers, hasOrder ? 'order' : 'name');
  }
  
  $scope.workers = sortedWorkers;
  
  for (let intIndex = 0; intIndex < $scope.workers.length; intIndex++) {
    $scope.workers[intIndex].showDescription = ($scope.workers[intIndex].description || '').substring(0, 70);
    $scope.workers[intIndex].isFullDescription = ($scope.workers[intIndex].description || '').length <= 70;
  }

  if (options.cabinetsEnabled) {
    let activeCabinets = _.filter(cabinets, function (cab) {
      return cab.active && !cab.isSpecial;
    });
    let tmp = _.sortBy(activeCabinets, 'name');
    let specCabinet = _.find(cabinets, function (cab) {
      return cab.isSpecial;
    });

    $scope.cabinets = specCabinet ? [specCabinet].concat(tmp) : tmp;
    if (specCabinet) {
      setTimeout(function () {
        $scope.selectCabinet(specCabinet);
      }, 0);
    }
  }
}

