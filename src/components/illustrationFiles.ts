// Written by scripts/prepare_illustrations.py. Do not edit by hand.
export const illustrationFiles = {
  "hero": {
    "width": 936,
    "height": 1024,
    "widths": [
      480,
      720,
      936
    ]
  },
  "auth_panel": {
    "width": 1122,
    "height": 1162,
    "widths": [
      480,
      760,
      1122
    ]
  },
  "band_first_customer": {
    "width": 1340,
    "height": 960,
    "widths": [
      480,
      800,
      1200
    ]
  },
  "booking_confirmed": {
    "width": 1536,
    "height": 1024,
    "widths": [
      400,
      640,
      960
    ]
  },
  "social_share": {
    "width": 1672,
    "height": 878,
    "widths": [
      640,
      1200
    ]
  }
} as const;
export type IllustrationName = keyof typeof illustrationFiles;
