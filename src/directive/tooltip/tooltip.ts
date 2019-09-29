import { appModule } from '../../module';
import { IViewDate, CalendarController } from '../calendar/calendar';
import './tooltip.scss';

class TooltipDirective implements ng.IDirective {
    restrict = 'A';
    scope = {
        date: '=momentCalendarTooltip',
    };
    controller = TooltipController;
    controllerAs = 'ctrl';
    bindToController = true;
    require = '^momentCalendar';
    link = ($scope, $element, $attrs, $ctrl: CalendarController) => {
        const ctrl = $scope.ctrl as TooltipController;
        ctrl.setController($ctrl);
    }
}

class TooltipController {
    private date: IViewDate;
    private $ctrl: CalendarController;
    private destroyFn: () => void;

    static $inject = ['$element'];
    constructor(
        private $element: ng.IAugmentedJQuery,
    ) { }

    $onInit() {
        this.$element.on('click', this.showTooltip);
    }

    $onDestroy() {
        this.$element.off('click', this.showTooltip);
        // destroy tooltip, if it's still visible for this date
        if (this.destroyFn) this.destroyFn();
    }

    setController($ctrl: CalendarController) {
        this.$ctrl = $ctrl;
        // this date was previously selected, show its tooltip again
        if ($ctrl.tooltipDate && $ctrl.tooltipDate.id === this.date.id) this.showTooltip();
    }

    private showTooltip = () => {
        this.destroyFn = this.$ctrl.showTooltip(this.$element, this.date);
    }
}

appModule
    .directive('momentCalendarTooltip', () => new TooltipDirective());