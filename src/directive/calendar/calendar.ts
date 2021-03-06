import * as moment from 'moment';
import { ResizeSensor } from 'css-element-queries';
import { appModule } from '../../module';
import * as template from './calendar.html';
import './calendar.scss';
import { throttle, contains, toPx } from '../../utils';
import Tooltip from 'tooltip.js';
import Popper from 'popper.js';
import {
    BODY_CLASS,
    DATE_LINE_HEIGHT,
    DATE_VPADDING,
    EVENT_LINE_HEIGHT,
    EVENT_VMARGIN,
    EVENT_VPADDING,
    MONTH_TITLE_FORMAT,
    LOCALE,
    HEADER_FORMAT,
    DAYS_FORMAT
} from '../../constants';

var date = new Date();
var d = date.getDate();
var m = date.getMonth();
var y = date.getFullYear();

const MOCK_EVENTS: IEvent[] = [
    { name: 'All Day Event', start: new Date(y, m, 1), end: new Date(y, m, 2) },
    { name: 'All Day Event', start: new Date(y, m, 1), end: new Date(y, m, 2) },
    { name: '2 Days Event', start: new Date(y, m, 2), end: new Date(y, m, 2 + 1) },
    { name: 'Custom event 1', start: new Date(y, m, d-12), end: new Date(y, m, d-9) },
    { name: 'Custom event 2', start: new Date(y, m, d-13), end: new Date(y, m, d-10) },
    { name: 'Custom event 3', start: new Date(y, m, d-10), end: new Date(y, m, d-9) },
    { name: 'Custom event 4', start: new Date(y, m, d-13), end: new Date(y, m, d-12) },
    { name: 'Long Event 1', start: new Date(y, m, d - 5+5), end: new Date(y, m, d + 2+5) },
    { name: 'Long Event 2', start: new Date(y, m, d - 5), end: new Date(y, m, d + 2) },
    { name: 'Long Event 3', start: new Date(y, m, d - 5), end: new Date(y, m, d + 2) },
    { name: 'Repeating Event 1', start: new Date(y, m, d - 3, 16, 0) },
    { name: 'Repeating Event 2', start: new Date(y, m, d + 4, 16, 0) },
    { name: 'Repeating Event 3', start: new Date(y, m, d - 3, 16, 0) },
    { name: 'Repeating Event 4', start: new Date(y, m, d + 4, 16, 0) },
    { name: 'Birthday Party', start: new Date(y, m, d + 1, 19, 30), end: new Date(y, m, d + 1, 22, 30) },
    { name: 'Click for Google', start: new Date(y, m, 28), end: new Date(y, m, 29) },
];

let tooltip: TooltipInternal;

interface TooltipInternal extends Tooltip {
    popperInstance: Popper;
}

interface IEvent {
    name: string;
    start: Date;
    end?: Date;
}

/** @internal */
export interface IViewEvent {
    event: IEvent;
    time?: string;
    offset: number;
    colSpan: number;
    startsThisDay: boolean;
    endsThisDay: boolean;
    endsThisWeek: boolean;
}

interface IViewWeek {
    dates: IViewDate[];
    rows: Array<{
        events: IViewEvent[];
        cols?: number;
    }>;
}

/** @internal */
export interface IViewDate {
    id: string;
    label: string;
    year: number;
    month: number;
    day: number;
    otherMonth: boolean;
    isToday: boolean;
    dragOver?: boolean;
    events?: IViewEvent[];
    additionalEvents?: number;
}

const DEFAULTS: Partial<CalendarController> = {
    today: false,
    showTime: true,
};

class CalendarDirective implements ng.IDirective {
    restrict = 'E';
    scope = {
        today: '=?',
        showTime: '=?',
    };
    controller = CalendarController;
    controllerAs = 'ctrl';
    bindToController = true;
    template = template;
}

/** @internal */
export  class CalendarController {
    /** If `true`, If `true`, it highlights the current date in the *Month View*. */
    today?: boolean;
    /** If `true`, it shows the start time of each event in the *Month View*. */
    showTime?: boolean;

    private firstDate: Date = moment().startOf('month').toDate();
    private resizeSensor: ResizeSensor;
    private unsubscriptions: Array<() => void> = [];

    title: string;
    header: string[];
    weeks: { [week: number]: IViewWeek };
    rowsPerWeek: number;
    tooltipDate: IViewDate;
    draggingEvent: IViewEvent;
    draggingDate: Date;

    static $inject = ['$scope', '$element', '$compile'];
    constructor(
        private $scope: ng.IScope,
        private $element: ng.IAugmentedJQuery,
        private $compile: ng.ICompileService,
    ) { }

    $onInit() {
        this.setDefaultValues();
        this.redrawOnHeightChange();
        this.changeDateOnScroll();
        this.setTooltipListeners();

        this.$scope.$watch('ctrl.firstDate', this.render);
    }

    $onDestroy() {
        this.unsubscriptions.forEach(unsubscribe => unsubscribe());
    }

    /** Set defualt value for un-defined parameters */
    private setDefaultValues() {
        Object.keys(DEFAULTS).forEach(key => {
            if (typeof this[key] === 'undefined') {
                this[key] = DEFAULTS[key];
            }
        });
    }

    /** Calculates the maximum number of rows that can be rendered for a week */
    private redrawOnHeightChange() {
        let lastHeight: number;
        const body = this.$element[0].querySelector(`.${BODY_CLASS}`);
        this.resizeSensor = new ResizeSensor(body, ({ height }) => {
            if (lastHeight !== height) {
                lastHeight = height;
                const rowHeight = height / 6;
                const eventsRowHeight = rowHeight - toPx(DATE_LINE_HEIGHT + DATE_VPADDING * 2);
                const eventHeight = toPx(EVENT_LINE_HEIGHT + EVENT_VMARGIN * 2 + EVENT_VPADDING * 2);
                const rowsPerWeek = Math.floor(eventsRowHeight / eventHeight);
                if (this.rowsPerWeek !== rowsPerWeek) {
                    this.rowsPerWeek = rowsPerWeek;
                    this.$scope.$evalAsync(this.render);
                }
                // re-positionate tooltip
                this.redrawTooltip();
            }
        });
        // register event unsubscription
        this.unsubscriptions.push(() => this.resizeSensor.detach());
    }

    /** Listen to wheel scroll event to navigate across weeks */
    private changeDateOnScroll() {
        const scrollThrottled = throttle((e: JQueryEventObject) => {
            const wheelAmount = ((e.originalEvent || e) as WheelEvent).deltaY;
            if (Math.abs(wheelAmount) > 0) {
                this.$scope.$evalAsync(() => {
                    const up = wheelAmount > 0;
                    const multiplier = wheelAmount > 5 ? 2 : wheelAmount > 100 ? 3 : 1;
                    const amount = multiplier * (up ? 7 : -7);
                    this.firstDate = moment(this.firstDate).add(amount, 'days').toDate();
                });
            }
        }, 50);

        this.$element.on('wheel', (e: JQueryEventObject) => {
            e.preventDefault();
            scrollThrottled(e);
        });

        // un-register `wheel` event on destroy
        this.unsubscriptions.push(() => this.$element.off('wheel'));
    }

    /** Gloabl listener for click event, to close the tooltip when clicking outside its content */
    private setTooltipListeners() {
        const onBodyClick = (e: MouseEvent) => {
            if (tooltip && !contains(tooltip.popperInstance.popper, e.target as Element)) {
                this.destroyTooltip();
                // reset tooltip date
                this.tooltipDate = undefined;
                // apply scope to ensure all styles related to tooltip date are updated
                this.$scope.$apply();
            }
        };

        document.body.addEventListener('click', onBodyClick, true);
        this.unsubscriptions.push(() => document.body.removeEventListener('click', onBodyClick));
    }

    /** Subtracts 1 month to the first rendered date */
    previousMonth() {
        const firstDate = moment(this.firstDate);
        const thisMonth = this.calculateCurrentMonth(firstDate);
        this.firstDate = thisMonth.subtract(1, 'month').startOf('month').startOf('week').toDate();
    }
    
    /** Add 1 month to the first rendered date */
    nextMonth() {
        const firstDate = moment(this.firstDate);
        const thisMonth = this.calculateCurrentMonth(firstDate);
        this.firstDate = thisMonth.add(1, 'month').startOf('month').startOf('week').toDate();
    }

    /** Return the selected month, based on the higher number of rendered days for each month */
    private calculateCurrentMonth(firstDate: moment.Moment) {
        let maxCountMonth: string;
        const months: { [month: string]: number } = {};
        const date = firstDate.clone();
        for (let i = 0; i < 5 * 7; i++) {
            const yearMonth = date.format('YYYYMM');
            months[yearMonth] = (months[yearMonth] || 0) + 1;
            if (!maxCountMonth || yearMonth !== maxCountMonth && months[yearMonth] > months[maxCountMonth]) {
                maxCountMonth = yearMonth;
            }
            date.add(1, 'day');
        }
        return moment(maxCountMonth, 'YYYYMM');
    }

    /** Recalculates the `weeks` property for rendering purpose */
    private render = () => {
        // header and title
        const firstDate = moment(this.firstDate);
        const thisMonth = this.calculateCurrentMonth(firstDate);
        this.title = thisMonth.format(MONTH_TITLE_FORMAT);
        this.header = moment.weekdays().map((d, i) => moment().locale(LOCALE).startOf('week').add(i, 'day').format(HEADER_FORMAT));

        const today = moment();
        const day = firstDate.clone().startOf('week').hour(12);
        const maxWeek = firstDate.weeksInYear();
        const firstWeek = day.week();
        const lastWeek = firstWeek + 5;
        const lastDay = firstDate.clone().add(5, 'weeks').endOf('weeks');

        let events = MOCK_EVENTS.slice();

        const getWeekCode = (week: number) => {
            const weekNo = week < firstWeek ? maxWeek + week : week;
            return weekNo;
        };
        const getSetViewDate = (date: moment.Moment) => {
            const w = getWeekCode(date.week());
            let week = this.weeks[w];
            if (!week) {
                week = this.weeks[w] = { dates: [], rows: [] };
            }
            const d = date.day();
            if (!week.dates[d]) {
                const viewDate: IViewDate = {
                    id: date.format('YYYYMMDD'),
                    label: date.format(DAYS_FORMAT),
                    year: date.year(),
                    month: date.month(),
                    day: date.date(),
                    isToday: date.isSame(today, 'day'),
                    otherMonth: date.isAfter(thisMonth, 'month') || date.isBefore(thisMonth, 'month'),
                    additionalEvents: 0
                };
                week.dates[d] = viewDate;
            }
            return week.dates[d];
        }
        const getEventTime = (event: IEvent): string | undefined => {
            // full day event
            if (!event.end) return;
    
            const startDate = moment(event.start);
            const { minutes } = startDate.toObject();
            let ltFormat = moment.localeData().longDateFormat('LT');
            // remove minutes
            if (minutes === 0) ltFormat = ltFormat.replace(/\:(mm|MM)/g, '');
            // lowercase meridiem -- no space before
            ltFormat = ltFormat.replace(' A', 'a');
            return startDate.format(ltFormat);
        }

        this.weeks = {};
        for (let w = firstWeek; w <= lastWeek; w++) {
            const weekNo = getWeekCode(w);
            const week = this.weeks[weekNo] = { dates: [], rows: [] };
            const startOfWeek = day.clone().startOf('week');
            const endOfWeek = day.clone().endOf('week');
            for (let d = 0; d < 7; d++) {
                // add view date to weeek
                getSetViewDate(day);

                // parse event list
                events = events.filter(event => {
                    const startsThisDay = day.isSame(event.start, 'day');
                    const continuesThisWeek = day.isSame(startOfWeek, 'day') &&
                        day.isAfter(event.start, 'day') &&
                        event.end &&
                        day.isSameOrBefore(event.end, 'day');
                    const endDate = !event.end ? day : moment(event.end).endOf('day');
                    if (startsThisDay || continuesThisWeek) {
                        // event should be added to this week
                        const endViewDate = moment.min(endDate, endOfWeek);
                        const endsThisDay = day.isSame(endDate, 'day');
                        const endsThisWeek = endOfWeek.isSameOrAfter(endDate, 'day');
                        const eventOffset = day.diff(startOfWeek, 'day');
                        const colSpan = endViewDate.diff(day, 'day') + 1;
                        // calculate row index
                        let rowIndex = week.rows.findIndex(row => (eventOffset + 1) > (row.cols || 0));
                        if (rowIndex === -1) {
                            rowIndex = week.rows.length > 0 ? week.rows.length : 0;
                        }
                        if (!week.rows[rowIndex]) {
                            week.rows[rowIndex] = { events:[] };
                        }
                        const time = getEventTime(event);
                        const offset = eventOffset - (week.rows[rowIndex].cols || 0);
                        const viewEvent: IViewEvent = {
                            event,
                            time,
                            offset,
                            colSpan,
                            startsThisDay,
                            endsThisDay,
                            endsThisWeek,
                        };
                        week.rows[rowIndex].cols = eventOffset + colSpan;
                        week.rows[rowIndex].events.push(viewEvent);

                        // set additional events
                        for (let c = 0; c < viewEvent.colSpan; c++) {
                            const thisDay = day.clone().add(c, 'day');
                            const date = getSetViewDate(thisDay);
                            if (!date.events) {
                                date.events = [];
                            }
                            date.events.push({
                                ...viewEvent,
                                startsThisDay: thisDay.isSame(event.start, 'day'),
                                endsThisDay: thisDay.isSame(endDate, 'day'),
                            });
                            if (rowIndex >= this.rowsPerWeek - 1) {
                                date.additionalEvents++;
                            }
                        }

                        // remove from the events to render array
                        if (endsThisWeek) {
                            return false;
                        }
                    }
                    // remove event if it won't be shown in the given period
                    const outOfBounds = firstDate.isAfter(endDate, 'date') || lastDay.isBefore(event.start);
                    if (outOfBounds) {
                        return false;
                    }
                    return true;
                });
                // next day
                day.add(1, 'days');
            }
        }

        // redraw tooltip
        this.redrawTooltip();
    }

    /** Show the tooltip for the given date in the given cell */
    showTooltip($date: ng.IAugmentedJQuery, date: IViewDate) {
        // hide visible tooltips
        if (tooltip) this.destroyTooltip();

        // create tooltip and show it
        this.tooltipDate = date;
        const $template = this.$compile('<moment-calendar-tooltip-content $ctrl="ctrl"></moment-calendar-tooltip-content>')(this.$scope);
        tooltip = new Tooltip($date[0], {
            boundariesElement: this.$element[0],
            container: this.$element[0],
            placement: 'bottom',
            trigger: 'manual',
            html: true,
            title: $template[0],
            arrowSelector: '.calendar-tooltip-arrow',
            innerSelector: '.calendar-tooltip-inner',
            template: '<div class="calendar-tooltip"><div class="calendar-tooltip-arrow"></div><div class="calendar-tooltip-inner"></div></div>',
            popperOptions: {
                onCreate: () => {
                    // apply scope to render the tooltip content
                    this.$scope.$apply();
                    // once the content is drawn, re-positionate the tooltip properly
                    this.redrawTooltip();
                }
            }
        }) as TooltipInternal;
        tooltip.show();

        // return destroy function, used to remove the tooltip when date will not be visible (e.g. scrolling up/down)
        return () => {
            if (this.tooltipDate && this.tooltipDate.id === date.id) {
                this.destroyTooltip();
            }
        }
    }

    /** Removes the tooltip */
    private destroyTooltip() {
        if (tooltip) {
            tooltip.dispose();
            tooltip = undefined;
        }
    }

    /** Recalculate the position of the tooltip (e.g. anchor point has been changed) */
    private redrawTooltip() {
        if (tooltip) {
            tooltip.popperInstance.update();
        }
    }

    eventDragStart(event: IViewEvent) {
        this.draggingEvent = event;
    }

    eventDragOver = throttle((date: IViewDate) => {
        const { start, end } = this.draggingEvent.event;
        const momentDate = moment(date.id, 'YYYYMMDD');
        if (!this.draggingDate) {
            if (momentDate.isBefore(start, 'day')) {
                this.draggingDate = start;
            } else
            if (end && momentDate.isAfter(end, 'day')) {
                this.draggingDate = end;
            } else {
                this.draggingDate = momentDate.toDate();
            }
        }
        const draggingDate = moment(this.draggingDate);
        const preDates = draggingDate.diff(start, 'day');
        const postDates = end ? draggingDate.diff(end, 'day') : 0;
        const newStart = momentDate.clone().subtract(preDates, 'days');
        const newEnd = end ? momentDate.clone().subtract(postDates, 'days') : newStart;
        Object.keys(this.weeks).forEach(w => {
            const week = this.weeks[w] as IViewWeek;
            week.dates.forEach(day => {
                const date = moment(day.id, 'YYYYMMDD');
                day.dragOver = date.isSameOrAfter(newStart, 'day') && date.isSameOrBefore(newEnd, 'day');
            });
        });
    }, 100);

    eventDragEnd() {
        this.draggingDate = undefined;
        this.draggingEvent = undefined;
        Object.keys(this.weeks).forEach(w => {
            const week = this.weeks[w] as IViewWeek;
            week.dates.forEach(day => {
                day.dragOver = false;
            });
        });
    }
}

appModule
    .directive('momentCalendar', () => new CalendarDirective());