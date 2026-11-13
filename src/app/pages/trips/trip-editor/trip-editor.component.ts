import {Component, Input, OnInit} from '@angular/core';
import {ModalController} from '@ionic/angular';
import {DEFAULT_TRIP_RADIUS, MAX_TRIP_DAYS, Trip, TRIP_RADIUS_OPTIONS} from 'src/app/models/trip';
import {GeocodeResult, GeocodingService} from 'src/app/services/geocoding.service';
import {TripsService} from 'src/app/services/trips.service';
import {CityOption} from 'src/app/util/cities';
import {addDays, eachDay, todayISO, toLocalISO} from 'src/app/util/dates';

/** How many F3 cities to suggest while typing */
const CITY_SUGGESTIONS = 5;

/**
 * Add or edit a trip: pick a place (an address via the geocoder, or one of
 * the cities that already has F3 workouts), the dates, and how far to look.
 */
@Component({
  selector: 'app-trip-editor',
  templateUrl: './trip-editor.component.html',
  styleUrls: ['./trip-editor.component.scss'],
})
export class TripEditorComponent implements OnInit {
  /** Present when editing; absent for a new trip */
  @Input() trip?: Trip;
  /** Cities with F3 workouts, for instant suggestions without a lookup */
  @Input() cities: CityOption[] = [];

  readonly radiusOptions = TRIP_RADIUS_OPTIONS;
  readonly maxTripDays = MAX_TRIP_DAYS;
  readonly minDate = todayISO();
  readonly maxDate = toLocalISO(addDays(new Date(), 366));

  query = '';
  place: GeocodeResult|null = null;
  name = '';
  startDate = todayISO();
  endDate = todayISO();
  radiusMiles = DEFAULT_TRIP_RADIUS;

  citySuggestions: CityOption[] = [];
  addressResults: GeocodeResult[] = [];
  searching = false;
  searchError = '';
  searched = false;

  constructor(
      private readonly modalCtrl: ModalController,
      private readonly geocoding: GeocodingService,
      private readonly trips: TripsService,
  ) {}

  ngOnInit() {
    // the nearby tab's miles setting is a good default for a new trip too
    const savedMiles = Number(localStorage.getItem('miles'));
    if (TRIP_RADIUS_OPTIONS.includes(savedMiles)) {this.radiusMiles = savedMiles;}

    if (this.trip) {
      this.place = {
        label: this.trip.name,
        placeName: this.trip.placeName,
        lat: this.trip.lat,
        long: this.trip.long,
      };
      this.name = this.trip.name;
      this.startDate = this.trip.startDate;
      this.endDate = this.trip.endDate;
      this.radiusMiles = this.trip.radiusMiles;
    }
  }

  get isEdit(): boolean {
    return !!this.trip;
  }

  get canSave(): boolean {
    return !!this.place && !!this.startDate && !!this.endDate;
  }

  get dayCount(): number {
    if (!this.startDate || !this.endDate) {return 0;}
    const [a, b] = [this.startDate, this.endDate].sort();
    return eachDay(a, b, MAX_TRIP_DAYS + 1).length;
  }

  get tooLong(): boolean {
    return this.dayCount > MAX_TRIP_DAYS;
  }

  /** Typing: suggest matching F3 cities instantly (no network) */
  onQueryInput(event: Event) {
    // Ionic 6's ionInput detail is the raw input event; the value is on the element
    this.query = `${(event.target as HTMLIonSearchbarElement)?.value ?? ''}`;
    this.addressResults = [];
    this.searchError = '';
    this.searched = false;
    const q = this.query.trim().toLowerCase();
    this.citySuggestions = q.length < 2 ? [] :
        this.cities.filter(c => c.city.toLowerCase().includes(q) ||
                                c.regions.some(r => r.toLowerCase().includes(q)))
            .slice(0, CITY_SUGGESTIONS);
  }

  /** Enter / the search button: look the text up as an address */
  async searchAddress() {
    const q = this.query.trim();
    if (q.length < 3 || this.searching) {return;}
    this.searching = true;
    this.searchError = '';
    try {
      this.addressResults = await this.geocoding.search(q);
      this.searched = true;
    } catch (error) {
      console.error('Address lookup failed:', error);
      this.searchError = 'Address lookup failed. Check your connection and try again.';
    } finally {
      this.searching = false;
    }
  }

  pickCity(city: CityOption) {
    this.choose({
      label: city.city,
      placeName: `${city.city} (${city.regions.join(', ')})`,
      lat: city.lat,
      long: city.long,
    });
  }

  pickAddress(result: GeocodeResult) {
    this.choose(result);
  }

  /** Back to the search box to pick a different place */
  changePlace() {
    this.place = null;
    this.query = '';
    this.citySuggestions = [];
    this.addressResults = [];
    this.searched = false;
  }

  /** Native date inputs: the OS picker on phones, a clearable field on desktop */
  onStartChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.startDate = isoDate(input.value) || this.startDate;
    input.value = this.startDate;
    if (this.endDate < this.startDate) {
      this.endDate = this.startDate;
    }
  }

  onEndChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.endDate = isoDate(input.value) || this.endDate;
    input.value = this.endDate;
    if (this.endDate < this.startDate) {
      this.startDate = this.endDate;
    }
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  save() {
    if (!this.canSave || this.tooLong) {return;}
    const trip: Trip = {
      id: this.trip?.id ?? this.trips.newId(),
      name: this.name.trim() || this.place.label,
      placeName: this.place.placeName,
      lat: this.place.lat,
      long: this.place.long,
      startDate: this.startDate,
      endDate: this.endDate,
      radiusMiles: this.radiusMiles,
      createdAt: this.trip?.createdAt ?? Date.now(),
    };
    this.modalCtrl.dismiss(trip, 'save');
  }

  private choose(place: GeocodeResult) {
    this.place = place;
    // a new trip takes the place's name; an edit keeps whatever it was called
    if (!this.isEdit || !this.name.trim()) {this.name = place.label;}
    this.citySuggestions = [];
    this.addressResults = [];
  }
}

/** Only a complete YYYY-MM-DD counts; a cleared field keeps the previous date */
function isoDate(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}
