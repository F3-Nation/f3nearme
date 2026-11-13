import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

import {TabsPage} from './tabs.page';

// /nearby keeps its URL (it's the PWA start page and what people have
// bookmarked); /trips sits beside it as the second tab.
const routes: Routes = [{
  path: '',
  component: TabsPage,
  children: [
    {
      path: 'nearby',
      loadChildren: () =>
          import('../nearby/nearby.module').then(m => m.NearbyPageModule),
    },
    {
      path: 'trips',
      loadChildren: () =>
          import('../trips/trips.module').then(m => m.TripsPageModule),
    },
    {
      path: '',
      redirectTo: '/nearby',
      pathMatch: 'full',
    },
  ],
}];

@NgModule({imports: [RouterModule.forChild(routes)], exports: [RouterModule]})
export class TabsPageRoutingModule {
}
