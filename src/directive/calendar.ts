import * as angular from 'angular';
import * as moment from 'moment';
import { appModule } from '../module';
import * as template from './calendar.html';
import './calendar.scss';

const LOCALE = 'it';
const DAYS_FORMAT = 'D';

var date = new Date();
var d = date.getDate();
var m = date.getMonth();
var y = date.getFullYear();

const MOCK_EVENTS: IEvent[] = [
    { name: 'All Day Event', start: new Date(y, m, 1) },
    { name: 'Long Event', start: new Date(y, m, d - 5), end: new Date(y, m, d - 2) },
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
    year?: number;
    month?: number;
    date?: number;
    hour?: number;
    minute?: number;
    second?: number;
    classes?: { [name: string]: boolean };
    selectable: boolean;
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
    currentMonth: moment.Moment = moment();
    title: string;
    header: string[];
    weeks: IViewWeek[];

    $onInit() {
        this.render();
    }

    private render() {
        const day = this.currentMonth.clone().startOf('month').startOf('week').hour(12);
        const weeks: { [week: number]: IViewWeek } = {};
        const firstWeek = day.week();
        const lastWeek = firstWeek + 5;

        let events = MOCK_EVENTS.slice();

        this.weeks = [];
        for (let week = firstWeek; week <= lastWeek; week++) {
            weeks[week] = { dates: [], rows: [] } as IViewWeek;
            const startOfWeek = day.clone().startOf('week');
            const endOfWeek = day.clone().endOf('week');
            for (let d = 0; d < 7; d++) {
                // prepare date
                const selectable = true;//this.$scope.limits.isSelectable(day, 'day');
                const disabled = false;//!selectable || day.month() !== month;
                const viewDate: IViewDate = {
                    id: day.date(),
                    label: day.format(DAYS_FORMAT),
                    year: day.year(),
                    month: day.month(),
                    date: day.date(),
                    // classes: {
                    //     highlighted: this.$scope.keyboard && day.isSame(this.$scope.view.moment, 'day'),
                    //     today: !!this.$scope.today && day.isSame(new Date(), 'day'),
                    //     disabled: disabled,
                    //     selected: isValidMoment(this.$ctrl.$modelValue) && day.isSame(this.$ctrl.$modelValue, 'day'),
                    // },
                    selectable: selectable
                };
                weeks[week].dates.push(viewDate);
                // prepare event
                events = events.filter(event => {
                    const startsToday = day.isSame(event.start, 'day');
                    const continuesThisWeek = day.isSame(startOfWeek, 'day') &&
                        day.isAfter(event.start, 'day') &&
                        event.end && endOfWeek.isSameOrAfter(event.end, 'day');
                    if (startsToday || continuesThisWeek) {
                        // event should be added to this week
                        const endDate = !event.end ? day : moment(event.end);
                        const endViewDate = moment.min(endDate, endOfWeek);
                        const offset = day.diff(startOfWeek, 'day');
                        const rowSpan = endViewDate.diff(day, 'day') + 1;
                        // calculate 
                        let rowIndex = weeks[week].rows.findIndex(row => (offset + 1) > (row.cols || 0));
                        if (rowIndex === -1) {
                            rowIndex = weeks[week].rows.length > 0 ? weeks[week].rows.length : 0;
                        }
                        const viewEvent: IViewEvent = {
                            event,
                            offset,
                            rowSpan,
                        };
                        if (weeks[week].rows[rowIndex]) {
                            weeks[week].rows[rowIndex] = { events:[] };
                        }
                        weeks[week].rows[rowIndex].cols = Math.max(weeks[week].rows[rowIndex].cols || 0, offset + rowSpan);
                        weeks[week].rows[rowIndex].events.push(viewEvent);
                        // remove from the events to render array
                        const endsThisWeek = endOfWeek.isSameOrAfter(endViewDate, 'day');
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
        Object.keys(weeks).forEach(key => this.weeks.push(weeks[key]));

        // header and title
        this.header = moment.weekdays().map((d, i) => moment().locale(LOCALE).startOf('week').add(i, 'day').format('dd'));
        this.title = this.currentMonth.format('MMMM YYYY');
    }
}

appModule
    .directive('momentCalendar', () => new CalendarDirective());