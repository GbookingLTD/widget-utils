import _ from 'lodash';

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
  var showInactiveWorkers = options.showInactiveWorkers || false;

  if (services.length > 1) {
    return businessData.business.resources.filter(function (resource) {
      // worker should execute all services
      let intersection = _.intersection(resource.taxonomies, services);
      return (showInactiveWorkers || resource.displayInWidget) && 
        (showAllWorkers || !resource.scheduleIsEmpty) &&
        intersection && intersection.length === services.length;
    });
  }
  
  const showAllWorkers = businessData.business.widget_configuration.showAllWorkers;
  return businessData.business.resources.filter(function (resource) {
    return (showInactiveWorkers || resource.displayInWidget) &&
      (showAllWorkers || !resource.scheduleIsEmpty) &&
      resource.taxonomies.indexOf('' + services[0]) !== -1;
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

  $scope.workers = _.sortBy(activeWorkers, options.sortByFn || (hasOrder ? 'order' : 'name'));
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

