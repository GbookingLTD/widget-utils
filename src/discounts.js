import * as _ from 'lodash';
import Moment from 'moment-timezone';
import { extendMoment } from 'moment-range';

const moment = extendMoment(Moment);

const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const weekDaysMap = {
  "sun": 0,
  "mon": 1,
  "tue": 2,
  "wed": 3,
  "thu": 4,
  "fri": 5,
  "sat": 6
};

export function getServiceActiveDiscounts(service, startTime) {
  if (!service.discounts || !service.discounts.length) {
    return [];
  }
  startTime = moment.utc(startTime);
  return service.discounts.filter(function (d) {
    return d.active &&
      moment.utc(d.start).isBefore(startTime) &&
      moment.utc(d.start).startOf('w').add('w', d.weeklyRepeat).isAfter(startTime);
  });
}

export function getServiceDiscount(service, time) {
  if (!service.discounts) {
    return [];
  }
  time = moment.utc(time);
  var activeDiscountsItems = service.discounts.filter(function (d) {
    return d.active &&
      d.days.indexOf(days[time.day()]) !== -1 &&
      moment.utc(d.start).isBefore(time) &&
      moment.utc(d.start).startOf('w').add('w', d.weeklyRepeat).isAfter(time);
  });
  var discounts = activeDiscountsItems.map(function (d) {
    var slot = _.find(d.slots, function (slot) {
      var slotStart = moment(time).startOf('day').add('m', slot.time.start);
      var slotEnd = moment(time).startOf('day').add('m', slot.time.end - 1);
      return moment.range(slotStart, slotEnd).contains(time);
    });
    return slot ? slot.amount : undefined;
  }).filter(function (d) {
    return d;
  });
  return _.first(discounts);
}

//recursively checks for parent's (ancestor's) discounts
function checkForParentDiscounts(businessData, taxonomyParentID, time) {
  var parentDiscount = {
    //discount: 0,
    //provider: 'LOCAL'
  };
  var timeInMinutes = time.hour() * 60 + time.minute();

  var t = businessData.business.taxonomies.filter(function (t) {
    return t.id === taxonomyParentID
  });
  if (t && t[0]) {
    if (!parentDiscount.discount && typeof t[0].discounts.regular !== 'undefined') {
      t[0].discounts.regular.forEach(function (discount) {
        var end = moment(discount.start).add(discount.weeklyRepeat, 'weeks');
        if (discount.active && (discount.unlimWeeklyRepeat || (time.isAfter(discount.start) && time.isBefore(end)))) {
          for (var day in discount.week) {
            discount.week[day].forEach(function (slot) {
              if (time.day() === weekDaysMap[day] && timeInMinutes >= slot.start && timeInMinutes <= slot.end) {
                parentDiscount = slot;
              }
            });
          }
        }
      });
    } else {
      if (!parentDiscount.discount && typeof t[0].taxonomyParentID !== "undefined" && t[0].taxonomyParentID) {
        parentDiscount = checkForParentDiscounts(businessData, t[0].taxonomyParentID, time);
      }
    }
  }

  return parentDiscount;
}

//recursively checks for parent's (ancestor's) discount exceptions
function checkForParentDiscountExceptions(businessData, taxonomyParentID, time) {
  var parentDiscount = {
    //discount: 0,
    provider: 'LOCAL'
  };
  var timeInMinutes = time.hour() * 60 + time.minute();

  businessData.business.taxonomies.forEach(function (t) {
    if (t.id === taxonomyParentID && typeof t.discounts.exceptions !== 'undefined') {
      t.discounts.exceptions.forEach(function (exception) {
        var date = moment(exception.date);
        if (exception.active && time.format("YYYY-MM-DD") === date.format("YYYY-MM-DD")) {
          exception.slots.forEach(function (slot) {
            if (timeInMinutes >= slot.start && timeInMinutes <= slot.end) {
              parentDiscount = slot;
            }
          });
        }
      });

      //if no discount exception found, check for parent's discount exceptions recursively
      if ((typeof parentDiscount.discount === 'undefined' || parentDiscount.discount == null) && typeof service.taxonomyParentID !== "undefined" && service.taxonomyParentID) {
        parentDiscount = checkForParentDiscountExceptions(taxonomyParentID, time);
      }
      return;
    }
  });
  return parentDiscount;
}

export function getServiceDiscountsAndExceptions(bData, service, time, campaignProvider) {
  if (!service || !service.discounts) {
    return 0;
  }

  var slot = {
    //discount: 0
  };

  var timeInMinutes = time.hour() * 60 + time.minute();

  //Checking for Exception Discounts, it has higher priority than Regular Discounts
  if (typeof service.discounts.exceptions !== 'undefined') {
    service.discounts.exceptions.forEach(function (exception) {
      var date = moment(exception.date);
      if (exception.active && time.format("YYYY-MM-DD") === date.format("YYYY-MM-DD")) {
        exception.slots.forEach(function (s) {
          if (timeInMinutes >= s.start && timeInMinutes <= s.end) {
            slot = s;
            slot.isException = true;
          }
        });
      }
    });
  }

  //Checking for Campaign & Regular Discounts, Regular Discounts has lower priority than Campaign Discounts
  if (_.isUndefined(slot.discount) && typeof service.discounts.regular !== 'undefined') {
    service.discounts.regular.forEach(function (discount) {
      var end = moment(discount.start).add(discount.weeklyRepeat, 'weeks');
      if (discount.active && ((time.isAfter(discount.start) && time.isBefore(end)) || discount.unlimWeeklyRepeat)) {
        for (var day in discount.week) {
          discount.week[day].forEach(function (s) {
            if (time.day() === weekDaysMap[day] && timeInMinutes >= s.start && timeInMinutes <= s.end) {
              //If Discount from Campagin is found, then overwrite even d. exceptions are set
              if (campaignProvider && s.provider === campaignProvider.toUpperCase()) {
                slot = s;
                return;
              }
              //set regular Discount, if Discount Exception is not found
              else if (!slot.discount && s.provider === "LOCAL") {
                slot = s;
              }
            }
          });
        }
      }
    });
  }

  //If no Discount Exception found, check for Parent's (Ancestor's) Discount Exceptions recursively
  if ((typeof slot.discount === 'undefined' || slot.discount == null) && typeof service.taxonomyParentID !== "undefined" && service.taxonomyParentID) {
    slot = checkForParentDiscountExceptions(bData, service.taxonomyParentID, time);
    slot.isException = true;
  }

  //If no Regular Discount found, check for Parent's (Ancestor's) Regular Discounts recursively
  if ((typeof slot.discount === 'undefined' || slot.discount == null) && typeof service.taxonomyParentID !== "undefined" && service.taxonomyParentID) {
    slot = checkForParentDiscounts(bData, service.taxonomyParentID, time);
  }

  return slot;
}
