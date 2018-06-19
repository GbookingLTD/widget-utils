import * as DateTime from './dateTime';
import * as BusySlots from './busySlots';
import * as Booking from './booking';
import * as Schedule from './schedule';
import { roundNumberUsingRule } from './roundNumberUsingRule';
import * as phoneUtils from './phoneUtils';
import * as langUtils from './langUtils';
import * as taxonomies from './taxonomies';
import * as Resources from './resources';
import * as ResourcesMostFree from './resources.mostFree';
import * as Discounts from './discounts';
import * as CracUtils from './crac-utils';

export default {
  DateTime,
  BusySlots,
  Booking,
  Schedule,
  roundNumberUsingRule,
  phoneUtils,
  langUtils,
  taxonomies,
  Taxonomies: taxonomies,
  Resources,
  ResourcesMostFree,
  Discounts,
  CracUtils
};
