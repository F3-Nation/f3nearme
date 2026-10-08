import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BeatdownService } from '../../services/beatdown.service';
import { Beatdown } from '../nearby/nearby.page';
import { ToastController } from '@ionic/angular';
import { directionsWebUrl, openDirections, openPlace, openWebsite } from 'src/app/util/external-links';

@Component({
  selector: 'app-workout',
  templateUrl: './workout.page.html',
  styleUrls: ['./workout.page.scss']
})
export class WorkoutPage implements OnInit {
  workout: Beatdown;
  relatedWorkouts: Beatdown[] = [];
  mapEmbedUrl: string;
  directionsUrl: string;
  loading = true;
  error = false;
  canShare = false;
  /** "Today", "Tomorrow" or "Thursday, Oct 9" for the Q/HC info, or '' once it is stale */
  nextLabel = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private beatdownService: BeatdownService,
    private toastController: ToastController
  ) {
    // Check if Web Share API is available
    this.canShare = 'share' in navigator;
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error = true;
      this.loading = false;
      return;
    }

    this.loadWorkout(id);
  }

  private loadWorkout(id: string) {
    this.beatdownService.getBeatdown(id).subscribe({
      next: (workout) => {
        if (!workout) {
          // Beatdown is deleted or doesn't exist - try partial ID match
          this.beatdownService.findBeatdownsByPartialId(id).subscribe({
            next: (matchingBeatdowns) => {
              if (matchingBeatdowns.length > 0) {
                // Found a match - redirect to the correct URL
                // Angular will re-initialize the component with the new route
                const matchedId = matchingBeatdowns[0].id;
                this.router.navigate(['/workout', matchedId], { replaceUrl: true });
              } else {
                // No match found
                this.error = true;
                this.loading = false;
              }
            },
            error: (err) => {
              console.error('Error searching for beatdown:', err);
              this.error = true;
              this.loading = false;
            }
          });
          return;
        }
        this.workout = workout;
        this.nextLabel = this.getNextLabel(workout.nextDate);
        this.mapEmbedUrl = `https://maps.google.com/maps?q=${workout.lat},${workout.long}&t=m&z=16&output=embed`;
        this.directionsUrl = directionsWebUrl(workout.lat, workout.long);
        this.loadRelatedWorkouts();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading workout:', err);
        this.error = true;
        this.loading = false;
      }
    });
  }

  async shareWorkout() {
    const url = window.location.href;
    const title = `${this.workout.name} - ${this.workout.dayOfWeek} at ${this.workout.timeString}`;
    const text = `Check out this F3 workout: ${this.workout.name} at ${this.workout.address}`;

    if (this.canShare) {
      try {
        await navigator.share({
          title,
          text,
          url
        });
      } catch (err) {
        console.error('Error sharing:', err);
        this.copyToClipboard(url);
      }
    } else {
      this.copyToClipboard(url);
    }
  }

  private async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      const toast = await this.toastController.create({
        message: 'Link copied to clipboard!',
        duration: 2000,
        position: 'bottom'
      });
      toast.present();
    } catch (err) {
      console.error('Error copying to clipboard:', err);
    }
  }

  private loadRelatedWorkouts() {
    if (!this.workout) return;

    this.beatdownService.getBeatdownsByLatLong(this.workout.lat, this.workout.long).subscribe({
      next: (workouts) => {
        // Filter out the current workout and sort by day
        this.relatedWorkouts = workouts
          .filter(w => w.id !== this.workout.id)
          .sort((a, b) => {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            return days.indexOf(a.dayOfWeek) - days.indexOf(b.dayOfWeek);
          });
      },
      error: (err) => {
        console.error('Error loading related workouts:', err);
      }
    });
  }

  /**
   * Label the Q/HC enrichment by how far out it is. The sweep only knows
   * about the next occurrence, so anything already behind us is dropped
   * rather than shown against the wrong day.
   */
  private getNextLabel(nextDate?: string): string {
    if (!nextDate) {
      return '';
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = nextDate.split('-').map(Number);
    const next = new Date(year, month - 1, day);
    const daysOut = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (daysOut < 0) {
      return '';
    }
    if (daysOut === 0) {
      return 'Today';
    }
    if (daysOut === 1) {
      return 'Tomorrow';
    }
    return next.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  openWebsite() {
    if (this.workout.website) {
      openWebsite(this.workout.website);
    }
  }

  openDirections() {
    openDirections(this.workout.lat, this.workout.long);
  }

  openMap() {
    openPlace(this.workout.lat, this.workout.long);
  }
} 