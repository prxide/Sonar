export class Filter {
  type: string;
  genres: string[];
  ratingRange: number[];
  yearRange: number[];
  inBookmarks: boolean;
  inRated: boolean;

  constructor(
    type: string,
    genres: string[],
    ratingRange: number[],
    yearRange: number[],
    inBookmarks: boolean,
    inRated: boolean
  ) {
    this.type = type;
    this.genres = genres;
    this.yearRange = yearRange;
    this.ratingRange = ratingRange;
    this.inBookmarks = inBookmarks;
    this.inRated = inRated;
  }
}
