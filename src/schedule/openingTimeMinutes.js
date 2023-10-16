"use strict";

import Moment from "moment-timezone";
import { extendMoment } from 'moment-range';

const momentTz = Moment;
const moment = extendMoment(Moment);

/**
 * @typedef {{
 *  calendarMode: number,
 *  openingTimeMinutes: number,
 *  bookableDateRanges: {
 *    start: string, end: string, enabled: boolean
 *  },
 *  bookableMonthsCount: number,
 *  daysForward: number,
 * }} WidgetConf
 */

/**
 * @typedef {{
 *   timezone: string
 * }} BusinessInfo
 */

/**
 * @typedef {{
 *   date: Date|string
 *   data: object[]
 * }} SlotsData
 */

/**
 * Hide new day until working hours (the "openingTimeMinutes" option).
 *
 * There are complaints that users spam new day at night hours before work day started.
 * This option should fix it. New day slots should appear when starting working day.
 *
 * @param {Array<SlotsData>} slotsData
 * @param {WidgetConf} widgetConf
 * @param {BusinessInfo} generalInfo
 * @private
 */
export function applyOpeningTimeMinutes(slotsData, widgetConf, generalInfo) {
  if (widgetConf.calendarMode) {
        return;
    }

    // When enabled option "openingTimeMinutes" in widgetConf.
    // Check if now spending time is less than openingTimeMinutes in the business timezone.
    // If less when remove new day from availableSlots.

    // Uncomment next line for tests
    // widgetConf.openingTimeMinutes = 13 * 60 + 40;
    if (!widgetConf.openingTimeMinutes) {
        return;
    }

    // Day opens at 00:00 UTC by default.
    // If the "openingTimeMinutes" option is enabled need to hide the new day slots until this time appears.
    // For that lets convert business time to UTC (businessNow) and compare the result with openingTimeMinutes.
    // If businessNow was not achieve to openingTimeMinutes need to remove new day slots.
    // To find
    // For example, lets say that in Berlin business 7:00AM and openingTimeMinutes=7:00AM
    // 7:00AM in Berlin equals to 5:00AM UTC. It is less than 7:00AM, so we shouldn't show new day (last item of
    // availableSlots).

    if (!generalInfo.timezone) {
        // tslint:disable-next-line:no-console
        console.error(
            `The "widgetConf.openingTimeMinutes" option isn't working due to it required "widgetConf.timezone"`,
        );

        return;
    }

    const bookableDateRangesEnabled =
        widgetConf.bookableDateRanges && widgetConf.bookableDateRanges.enabled &&
        widgetConf.bookableDateRanges.end;

    if (!bookableDateRangesEnabled && !widgetConf.bookableMonthsCount && !widgetConf.daysForward) {
        // tslint:disable-next-line:no-console
        console.error(
            `The "widgetConf.openingTimeMinutes" option isn't working due to it required ` +
            `"widgetConf.bookableDateRanges", "widgetConf.bookableMonthsCount" or "widgetConf.daysForward"`,
        );

        return;
    }

    const businessNowMinutes = minutesSinceStartOfDayInTimezone(generalInfo.timezone);
    const hideNewDay = businessNowMinutes < widgetConf.openingTimeMinutes;

    if (hideNewDay) {
        // Find new day item and clean slots there.
        // item.date has really business time in UTC.
        // For instance, "2020-10-17T02:34:52Z" is the time without "Z" in business timezone.
        // For business in Berlin it equals to "2020-10-17T02:34:52+02:00".
        // It reads as a utc date here
        // src/mappers/TimeSlotMapper.ts:252
        // Due to correct compare you should add timezone offset to correct date again (or remove from item.date).

        const newDayDate = bookableMonthCountLastDay(widgetConf) || (bookableDateRangesEnabled
            ? moment.utc(widgetConf.bookableDateRanges.end)
            : moment.utc().add(widgetConf.daysForward, 'days'));

        // @see here https://momentjs.com/timezone/docs/#/zone-object/
        const tzOffsetMinutes = momentTz.tz.zone(generalInfo.timezone).utcOffset(Date.now());
        newDayDate.add(-tzOffsetMinutes, 'minutes');

        // console.log("applyOpeningTimeMinutes date", newDayDate.toISOString())
        const newDay = slotsData.find((item) => moment(item.date).isSame(newDayDate, 'day'));
        if (newDay) {
            newDay.data = [];
        }
    }
}

/**
 * Returns last day of in which available booking according "widgetConf.bookableMonthCount" option
 *
 * @param widgetConf
 * @private
 */
function bookableMonthCountLastDay(widgetConf) {
    if (!widgetConf.bookableMonthsCount) {
        return undefined;
    }

    let end;
    if (widgetConf.bookableMonthsCount < 1) {
        const weeks = Math.round(widgetConf.bookableMonthsCount / 0.24);
        end = moment.utc().add(weeks, 'week');
    } else {
        end = moment.utc().add(widgetConf.bookableMonthsCount, 'month');
    }

    //end.add(-1, 'day');
    return end;
}

/**
 * Calculates the number of minutes since the start of the day in the specified timezone.
 *
 * @param {string} timezone - The timezone to calculate the minutes since start of day for.
 * @return {number} The number of minutes since the start of the day in the specified timezone.
 */
function minutesSinceStartOfDayInTimezone(timezone) {
    const now = momentTz.tz(timezone);
    const midnight = now.clone().startOf('day');

    return now.diff(midnight, 'minutes');
}

