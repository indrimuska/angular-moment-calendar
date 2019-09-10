import * as moment from 'moment';
import { appModule } from '../module';
import * as template from './calendar.html';
import './calendar.scss';
import { throttle } from '../utils';

const LOCALE = 'it';
const MONTH_TITLE_FORMAT = 'MMMM YYYY';
const HEADER_FORMAT = 'ddd';
const DAYS_FORMAT = 'D';
const ROWS_PER_WEEK = 3;

var date = new Date();
var d = date.getDate();
var m = date.getMonth();
var y = date.getFullYear();

const MOCK_EVENTS: IEvent[] = [
    { name: 'All Day Event', start: new Date(y, m, 1) },
    { name: 'Long Event', start: new Date(y, m, d - 5), end: new Date(y, m, d + 2) },
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
    rowSpan: number;
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
    // weeks: IViewWeek[];
    weeks: { [week: number]: IViewWeek };
    rowsPerWeek: number = ROWS_PER_WEEK;

    static $inject = ['$scope', '$element'];
    constructor(
        private $scope: ng.IScope,
        private $element: ng.IAugmentedJQuery,
    ) { }

    $onInit() {
        this.$scope.$watch('ctrl.firstDate', () => {
            this.render();
        });
        this.$element.on('wheel', throttle((e: JQueryEventObject | WheelEvent) => this.$scope.$evalAsync(() => {
            const wheelAmount = (((e as JQueryEventObject).originalEvent || e) as WheelEvent).deltaY;
            if (Math.abs(wheelAmount) > 0) {
                const up = wheelAmount > 0;
                const amount = up ? 7 : -7;
                this.firstDateSum(amount, 'days');
            }
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }), 100));
        // this.$element.on('scroll', e => {
        //     e.preventDefault();
        // });
    }

    private firstDateSum(amount: number, unit: moment.unitOfTime.DurationConstructor) {
        const firstDate = moment(this.firstDate);
        this.firstDate = firstDate.add(amount, unit).toDate();

    }

    previousMonth() {
        this.firstDateSum(-1, 'month');
    }

    nextMonth() {
        this.firstDateSum(1, 'month');
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

    private render() {
        // header and title
        const firstDate = moment(this.firstDate);
        const thisMonth = this.calculateCurrentMonth(firstDate);
        this.title = thisMonth.format(MONTH_TITLE_FORMAT);
        this.header = moment.weekdays().map((d, i) => moment().locale(LOCALE).startOf('week').add(i, 'day').format(HEADER_FORMAT));

        const day = firstDate.clone().startOf('week').hour(12);
        const weeks: { [week: number]: IViewWeek } = {};
        const firstWeek = day.week();
        const lastWeek = firstWeek + 5;

        let events = MOCK_EVENTS.slice();

        this.weeks = [];
        for (let w = firstWeek; w <= lastWeek; w++) {
            weeks[w] = { dates: [], rows: [] } as IViewWeek;
            const week = weeks[w];
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
                    if (startsToday || continuesThisWeek) {
                        // event should be added to this week
                        const endDate = !event.end ? day : moment(event.end);
                        const endViewDate = moment.min(endDate, endOfWeek);
                        const endsThisWeek = endOfWeek.isSameOrAfter(endDate, 'day');
                        const weekOffset = day.diff(startOfWeek, 'day');
                        const rowSpan = endViewDate.diff(day, 'day') + 1;
                        // calculate row index
                        let rowIndex = week.rows.findIndex(row => (weekOffset + 1) > (row.cols || 0));
                        if (rowIndex === -1) {
                            rowIndex = week.rows.length > 0 ? week.rows.length : 0;
                        }
                        if (!week.rows[rowIndex]) {
                            week.rows[rowIndex] = { events:[] };
                        }
                        const offset = weekOffset - (week.rows[rowIndex].cols || 0);
                        const viewEvent: IViewEvent = {
                            event,
                            offset,
                            rowSpan,
                            continuesThisWeek,
                            endsThisWeek,
                        };
                        week.rows[rowIndex].cols = Math.max(week.rows[rowIndex].cols || 0, offset + rowSpan);
                        week.rows[rowIndex].events.push(viewEvent);
                        // remove from the events to render array
                        if (endsThisWeek) {
                            return false;
                        }
                    }
                    return true;
                });
                // next day
                day.add(1, 'days');
            }
        }
        // object to array
        // Object.keys(weeks).forEach(key => this.weeks.push(weeks[key]));
        this.weeks = weeks;
    }
}

appModule
    .directive('momentCalendar', () => new CalendarDirective());