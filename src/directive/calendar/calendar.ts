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
    { name: 'All Day Event', start: new Date(y, m, 1), end: new Date(y, m, 3) },
    { name: 'All Day Event', start: new Date(y, m, 1), end: new Date(y, m, 3) },
    { name: 'All Day Event', start: new Date(y, m, 2), end: new Date(y, m, 4) },
    { name: 'Custom event', start: new Date(y, m, d-12), end: new Date(y, m, d-8) },
    { name: 'Custom event', start: new Date(y, m, d-13), end: new Date(y, m, d-10) },
    { name: 'Custom event', start: new Date(y, m, d-10), end: new Date(y, m, d-8) },
    { name: 'Custom event', start: new Date(y, m, d-13), end: new Date(y, m, d-12) },
    { name: 'Long Event', start: new Date(y, m, d - 5+5), end: new Date(y, m, d + 2+5) },
    { name: 'Long Event', start: new Date(y, m, d - 5), end: new Date(y, m, d + 2) },
    { name: 'Long Event', start: new Date(y, m, d - 5), end: new Date(y, m, d + 2) },
    { name: 'Repeating Event', start: new Date(y, m, d - 3, 16, 0) },
    { name: 'Repeating Event', start: new Date(y, m, d + 4, 16, 0) },
    { name: 'Repeating Event', start: new Date(y, m, d - 3, 16, 0) },
    { name: 'Repeating Event', start: new Date(y, m, d + 4, 16, 0) },
    { name: 'Birthday Party', start: new Date(y, m, d + 1, 19, 0), end: new Date(y, m, d + 1, 22, 30) },
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

interface IViewEvent {
    event: IEvent;
    offset: number;
    colSpan: number;
    continuesThisWeek: boolean;
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
    date: number;
    otherMonth: boolean;
    events?: IEvent[];
    additionalEvents?: number;
}

class CalendarDirective implements ng.IDirective {
    restrict = 'E';
    scope = {};
    controller = CalendarController;
    controllerAs = 'ctrl';
    bindToController = true;
    template = template;
}

/** @internal */
export  class CalendarController {
    private firstDate: Date = moment().startOf('month').toDate();
    private resizeSensor: ResizeSensor;
    private unsubscriptions: Array<() => void> = [];

    title: string;
    header: string[];
    weeks: { [week: number]: IViewWeek };
    rowsPerWeek: number;
    tooltipDate: IViewDate;

    static $inject = ['$scope', '$element', '$compile'];
    constructor(
        private $scope: ng.IScope,
        private $element: ng.IAugmentedJQuery,
        private $compile: ng.ICompileService,
    ) { }

    $onInit() {
        this.redrawOnHeightChange();
        this.changeDateOnScroll();
        this.setTooltipListeners();

        this.$scope.$watch('ctrl.firstDate', this.render);
    }

    $onDestroy() {
        this.unsubscriptions.forEach(unsubscribe => unsubscribe());
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
                    const amount = up ? 7 : -7;
                    this.firstDate = moment(this.firstDate).add(amount, 'days').toDate();
                });
            }
        }, 100);

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
        let maxCountMonth: number;
        const months: { [month: number]: number } = {};
        const date = firstDate.clone();
        for (let i = 0; i < 5 * 7; i++) {
            const month = date.get('month');
            months[month] = (months[month] || 0) + 1;
            if (!maxCountMonth || month !== maxCountMonth && months[month] > months[maxCountMonth]) {
                maxCountMonth = month;
            }
            date.add(1, 'day');
        }
        return date.set('month', maxCountMonth);
    }

    /** Recalculates the `weeks` property for rendering purpose */
    private render = () => {
        // header and title
        const firstDate = moment(this.firstDate);
        const thisMonth = this.calculateCurrentMonth(firstDate);
        this.title = thisMonth.format(MONTH_TITLE_FORMAT);
        this.header = moment.weekdays().map((d, i) => moment().locale(LOCALE).startOf('week').add(i, 'day').format(HEADER_FORMAT));

        const day = firstDate.clone().startOf('week').hour(12);
        const firstWeek = day.week();
        const lastWeek = firstWeek + 5;
        const lastDay = firstDate.clone().add(5, 'weeks').endOf('weeks');

        let events = MOCK_EVENTS.slice();

        this.weeks = {};
        for (let w = firstWeek; w <= lastWeek; w++) {
            this.weeks[w] = { dates: [], rows: [] };
            const week = this.weeks[w];
            const startOfWeek = day.clone().startOf('week');
            const endOfWeek = day.clone().endOf('week');
            for (let d = 0; d < 7; d++) {
                // prepare date
                const viewDate: IViewDate = {
                    id: day.format('YYYYMMDD'),
                    label: day.format(DAYS_FORMAT),
                    year: day.year(),
                    month: day.month(),
                    date: day.date(),
                    otherMonth: day.isAfter(thisMonth, 'month') || day.isBefore(thisMonth, 'month')
                };
                week.dates.push(viewDate);
                // prepare event
                events = events.filter(event => {
                    const startsToday = day.isSame(event.start, 'day');
                    const continuesThisWeek = day.isSame(startOfWeek, 'day') &&
                        day.isAfter(event.start, 'day') &&
                        event.end &&
                        day.isSameOrBefore(event.end, 'day');
                    const endDate = !event.end ? day : moment(event.end);
                    if (startsToday || continuesThisWeek) {
                        // event should be added to this week
                        const endViewDate = moment.min(endDate, endOfWeek);
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
                        const offset = eventOffset - (week.rows[rowIndex].cols || 0);
                        const viewEvent: IViewEvent = {
                            event,
                            offset,
                            colSpan,
                            continuesThisWeek,
                            endsThisWeek,
                        };
                        week.rows[rowIndex].cols = eventOffset + colSpan;
                        week.rows[rowIndex].events.push(viewEvent);
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
            // group events
            if (true || week.rows.length > this.rowsPerWeek) {
                week.rows.forEach((row, rowIndex) => {
                    let offset = 0;
                    row.events.forEach(event => {
                        for (let c = 0; c < event.colSpan; c++) {
                            const index = offset + event.offset + c;
                            const date = week.dates[index];
                            if (!date.events) {
                                date.events = [];
                            }
                            date.events.push(event.event);
                            date.additionalEvents = Math.max(rowIndex - 1, date.events.length - this.rowsPerWeek + 1);
                        }
                        offset += event.offset + event.colSpan;
                    });
                });
                // week.rows.splice(this.rowsPerWeek - 1, week.rows.length - (this.rowsPerWeek - 1));
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
        const $template = this.$compile('<moment-calendar-tooltip-content date="ctrl.tooltipDate"></moment-calendar-tooltip-content>')(this.$scope);
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
}

appModule
    .directive('momentCalendar', () => new CalendarDirective());