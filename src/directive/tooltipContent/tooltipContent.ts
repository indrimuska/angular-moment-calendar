import * as moment from 'moment';
import { appModule } from '../../module';
import { CalendarController } from '../calendar/calendar';
import * as template from './tooltipContent.html';
import { DAY_TOOLTIP_FORMAT } from '../../constants';

class TooltipContentDirective implements ng.IDirective {
    restrict = 'E';
    scope = {
        $ctrl: '='
    };
    controller = TooltipContentController;
    controllerAs = 'ctrl';
    bindToController = true;
    template = template;
}

class TooltipContentController {
    $ctrl: CalendarController;
    title: string;

    $onInit() {
        this.title = moment(this.$ctrl.tooltipDate).format(DAY_TOOLTIP_FORMAT);
    }
}

appModule
    .directive('momentCalendarTooltipContent', () => new TooltipContentDirective());