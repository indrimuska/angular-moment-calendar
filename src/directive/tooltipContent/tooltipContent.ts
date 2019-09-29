import { appModule } from '../../module';
import { IViewDate } from '../calendar/calendar';
import * as template from './tooltipContent.html';
import moment = require('moment');

const DAY_TOOLTIP_FORMAT = 'LL';

class TooltipContentDirective implements ng.IDirective {
    restrict = 'E';
    scope = {
        date: '='
    };
    controller = TooltipContentController;
    controllerAs = 'ctrl';
    bindToController = true;
    template = template;
}

class TooltipContentController {
    date: IViewDate;

    title: string;

    $onInit() {
        this.title = moment(this.date).format(DAY_TOOLTIP_FORMAT);
    }
}

appModule
    .directive('momentCalendarTooltipContent', () => new TooltipContentDirective());