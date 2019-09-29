import * as moment from 'moment';
import { appModule } from '../../module';
import { IViewDate } from '../calendar/calendar';
import * as template from './tooltipContent.html';
import { DAY_TOOLTIP_FORMAT } from '../../constants';

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