import * as moment from 'moment';
import { ResizeSensor } from 'css-element-queries';
import { appModule } from '../module';
import * as template from './calendar.html';
import './calendar.scss';
import { throttle } from '../utils';

const LOCALE = 'it';
const MONTH_TITLE_FORMAT = 'MMMM YYYY';
const HEADER_FORMAT = 'ddd';
const DAYS_FORMAT = 'D';

const BODY_CLASS = 'calendar-body';
const DATE_LINE_HEIGHT = 1; // rem
const DATE_VPADDING = 0.1; // rem
const EVENT_LINE_HEIGHT = 1; // rem
const EVENT_VMARGIN = 0.1; // rem
const EVENT_VPADDING = 0.1; // rem

const dateAdd = (date: Date, amount: number, unit: moment.unitOfTime.DurationConstructor) => moment(date).add(amount, unit).toDate();
const toPx = (rem: number) => rem * parseFloat(getComputedStyle(document.documentElement).fontSize);

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

interface IViewDate {
    id: number;
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
    scope = {
    };
    controller = CalendarController;
    controllerAs = 'ctrl';
    bindToController = true;
    template = template;
}

class CalendarController {
    private firstDate: Date = moment().startOf('month').toDate();

    title: string;
    header: string[];
    weeks: { [week: number]: IViewWeek };
    rowsPerWeek: number;

    private resizeSensor: ResizeSensor;

    static $inject = ['$scope', '$element'];
    constructor(
        private $scope: ng.IScope,
        private $element: ng.IAugmentedJQuery,
    ) { }

    $onInit() {
        this.addResizeSensor();
        this.addScrollListener();

        this.$scope.$watch('ctrl.firstDate', () => {
            this.render();
        });
    }

    $onDestroy() {
        this.resizeSensor.detach();
        this.$element.off('wheel');
    }

    private addResizeSensor() {
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
            }
        });
    }

    private addScrollListener() {
        this.$element.on('wheel', throttle((e: JQueryEventObject) => this.$scope.$evalAsync(() => {
            const wheelAmount = ((e.originalEvent || e) as WheelEvent).deltaY;
            if (Math.abs(wheelAmount) > 0) {
                const up = wheelAmount > 0;
                const amount = up ? 7 : -7;
                this.firstDate = moment(this.firstDate).add(amount, 'days').toDate();
            }
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }), 100));
        // this.$element.on('scroll', e => {
        //     e.preventDefault();
        // });
    }

    previousMonth() {
        const firstDate = moment(this.firstDate);
        const thisMonth = this.calculateCurrentMonth(firstDate);
        this.firstDate = thisMonth.subtract(1, 'month').startOf('month').startOf('week').toDate();
    }

    nextMonth() {
        const firstDate = moment(this.firstDate);
        const thisMonth = this.calculateCurrentMonth(firstDate);
        this.firstDate = thisMonth.add(1, 'month').startOf('month').startOf('week').toDate();
    }

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
                    id: day.date(),
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
    }
}

appModule
    .directive('momentCalendar', () => new CalendarDirective());