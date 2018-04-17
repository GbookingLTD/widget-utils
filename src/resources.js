import _ from 'lodash';

/**
 * Выбираем только тех работников, которые выполяют указанную услугу (услуги).
 *
 * @param businessData
 * @param serviceId
 * @param multiServices
 * @param options
 * @returns {[]}
 */
export function filterWorkersByTaxonomies(businessData, serviceId, multiServices, options) {
  options = options || {};
  var showInactiveWorkers = options.showInactiveWorkers || false;

  if (serviceId && serviceId === 'multiservicebooking' && multiServices && multiServices.length) {
    var services = _.map(multiServices, 'id');
    return businessData.business.resources.filter(function (resource) {
      var intersection = _.intersection(resource.taxonomies, services);
      return (showInactiveWorkers || resource.displayInWidget) && intersection && intersection.length === services.length;
    });
  }

  return businessData.business.resources.filter(function (resource) {
    return (showInactiveWorkers || resource.displayInWidget) && resource.taxonomies.indexOf('' + serviceId) !== -1;
  });
}

/**
 * Подготавливает список работников и кабинетов для их отображения на виджете.
 *
 * @param $scope
 * @param workers
 * @param cabinets
 * @param options
 */
export function prepareWorkers($scope, workers, cabinets, options) {
  options = options || {};
  options.showInactiveWorkers = options.showInactiveWorkers || false;
  options.cabinetsEnabled = options.cabinetsEnabled || false;

  let activeWorkers = options.showInactiveWorkers ? workers : _.filter(workers, {'status': 'ACTIVE'});
  let hasOrder = _.all(activeWorkers, 'order');

  $scope.workers = _.sortBy(activeWorkers, hasOrder ? 'order' : 'name');
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

