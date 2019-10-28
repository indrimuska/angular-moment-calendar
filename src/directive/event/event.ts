import { appModule } from "../../module";
import * as template from './event.html';
import { IViewEvent, CalendarController } from "../calendar/calendar";

class EventDirective implements ng.IDirective {
    restrict = 'E';
    scope = {
        item: '=',
        $ctrl: '=',
    };
    controller = EventController;
    controllerAs = 'ctrl';
    bindToController = true;
    template = template;
}

class EventController {
    item: IViewEvent;
    $ctrl: CalendarController;

    static $inject = ['$element', '$scope'];
    constructor(
        private $element: ng.IAugmentedJQuery,
        private $scope: ng.IScope,
    ) { }

    $onInit() {
        this.$element.on('dragstart', () => this.$scope.$evalAsync(() => {
            this.$ctrl.eventDragStart(this.item);
        }));
        this.$element.on('dragend', () => this.$scope.$evalAsync(() => {
            this.$ctrl.eventDragEnd();
        }));
    }

    $onDestroy() {
        this.$element.off('dragstart');
        this.$element.off('dragend');
    }
}

appModule
    .directive('momentCalendarEvent', () => new EventDirective());