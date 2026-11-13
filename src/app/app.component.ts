import {Component} from '@angular/core';

import {AppUpdateService} from './services/app-update.service';
import {PushService} from './services/push.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  readonly updateReady$ = this.appUpdate.updateReady$;

  constructor(
      private readonly appUpdate: AppUpdateService,
      private readonly push: PushService,
  ) {
    appUpdate.start();
    // keeps the reminder backend's copy of saved trips current
    push.start();
  }
}
