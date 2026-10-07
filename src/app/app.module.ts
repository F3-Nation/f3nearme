import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {ScreenTrackingService, UserTrackingService} from '@angular/fire/analytics';
import {AngularFireModule} from '@angular/fire/compat';
import {AngularFireAnalyticsModule} from '@angular/fire/compat/analytics';
import {AngularFireFunctionsModule, REGION, USE_EMULATOR as USE_FUNCTIONS_EMULATOR} from '@angular/fire/compat/functions';
import {AngularFirestoreModule} from '@angular/fire/compat/firestore';
import {BrowserModule} from '@angular/platform-browser';
import {RouteReuseStrategy} from '@angular/router';
import {ServiceWorkerModule} from '@angular/service-worker';
import {IonicModule, IonicRouteStrategy} from '@ionic/angular';
import {environment} from 'src/environments/environment';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {UpdateBannerComponent} from './components/update-banner/update-banner.component';

const emulatorProviders: any[] = [];
if (environment.useEmulators) {
  emulatorProviders.push(
    { provide: USE_FUNCTIONS_EMULATOR, useValue: [environment.emulators.functions.host, environment.emulators.functions.port] },
  );
}

@NgModule({
  declarations: [
    AppComponent,
    UpdateBannerComponent,
  ],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    HttpClientModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAnalyticsModule,
    AngularFireFunctionsModule,
    AngularFirestoreModule,
    // The worker was already being built (angular.json) but never registered,
    // so the app got none of it. Register right away rather than waiting for
    // Angular to report "stable": Firestore's live listeners keep it from ever
    // settling, so the default strategy would wait the full 30s and a short
    // first visit never got the app shell cached for the next launch.
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerImmediately',
    }),
  ],
  providers: [
    ScreenTrackingService,
    UserTrackingService,
    {provide: RouteReuseStrategy, useClass: IonicRouteStrategy},
    ...emulatorProviders,
  ],
  bootstrap: [
    AppComponent,
  ],
})
export class AppModule {
}
