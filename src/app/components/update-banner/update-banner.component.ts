import {Component} from '@angular/core';
import {AppUpdateService} from 'src/app/services/app-update.service';

/**
 * Slim banner offering a one-tap reload once the service worker has a new
 * version of the app downloaded. Sits above the routed page so it never covers
 * page content.
 */
@Component({
  selector: 'app-update-banner',
  templateUrl: './update-banner.component.html',
  styleUrls: ['./update-banner.component.scss'],
})
export class UpdateBannerComponent {
  readonly ready$ = this.appUpdate.updateReady$;

  constructor(private readonly appUpdate: AppUpdateService) {}

  update() {
    this.appUpdate.reload();
  }

  later() {
    this.appUpdate.dismiss();
  }
}
