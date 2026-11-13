import {Component} from '@angular/core';

/**
 * The two top-level views: workouts near you, and the trips you've planned.
 * The tab bar floats over the content as a pill rather than spanning the
 * bottom edge, so the list keeps every pixel of width.
 */
@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
})
export class TabsPage {
}
