import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {IonicModule} from '@ionic/angular';

import {TripEditorComponent} from './trip-editor/trip-editor.component';
import {TripsPageRoutingModule} from './trips-routing.module';
import {TripsPage} from './trips.page';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TripsPageRoutingModule,
  ],
  declarations: [TripsPage, TripEditorComponent],
})
export class TripsPageModule {
}
