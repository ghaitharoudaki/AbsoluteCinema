/*
 * Profile badges. Worked out from live stats every time a profile loads, never stored:
 * nothing goes stale, and the Projectionist crown moves the moment someone overtakes the leader.
 */

export interface BadgeStats {
  totalHours: number
  /** Highest total hours of anyone on the site. */
  topHours: number
  maxEpisodesInDay: number
  completedSeries: number
  ratingCount: number
  avgRating: number | null
  genreCount: number
  decadeCount: number
  /** Ratings with notes the user wrote (import tags don't count). */
  notesCount: number
  followers: number
}

export interface Badge {
  id: string
  name: string
  icon: string
  description: string
  earned: boolean
  /** How close they are, for locked badges (and the next step for milestones). */
  progress?: string
}

const HOUR_MILESTONES = [
  { hours: 50, name: 'Matinee', icon: '🎟️' },
  { hours: 100, name: 'Double Feature', icon: '🎞️' },
  { hours: 250, name: 'Marathoner', icon: '🏃' },
  { hours: 500, name: 'Legend of the Dark', icon: '🌑' },
] as const

const round = (n: number) => Math.floor(n)

function threshold(id: string, name: string, icon: string, description: string, value: number, goal: number, unit: string): Badge {
  const earned = value >= goal
  return { id, name, icon, description, earned, progress: earned ? undefined : `${Math.min(value, goal)} / ${goal} ${unit}` }
}

export function computeBadges(s: BadgeStats): Badge[] {
  const badges: Badge[] = []

  const crowned = s.totalHours > 0 && s.totalHours >= s.topHours
  badges.push({
    id: 'projectionist',
    name: 'Projectionist',
    icon: '👑',
    description: 'Most hours watched of anyone on Absolute Cinema. Held until someone overtakes you.',
    earned: crowned,
    progress: crowned ? undefined : `${Math.max(1, Math.ceil(s.topHours - s.totalHours))}h behind the leader`,
  })

  const reached = HOUR_MILESTONES.filter((m) => s.totalHours >= m.hours)
  const current = reached.at(-1)
  const next = HOUR_MILESTONES.find((m) => s.totalHours < m.hours)
  const shown = current ?? HOUR_MILESTONES[0]
  badges.push({
    id: 'hours',
    name: shown.name,
    icon: shown.icon,
    description: `Watched ${shown.hours}+ hours of films and series.`,
    earned: !!current,
    progress: next
      ? current
        ? `${round(s.totalHours)} / ${next.hours} hours to ${next.name}`
        : `${round(s.totalHours)} / ${next.hours} hours`
      : undefined,
  })

  badges.push(threshold('opening-night', 'Opening Night', '🎬', 'Logged your first rating.', s.ratingCount, 1, 'rating'))
  badges.push(threshold('binge-machine', 'Binge Machine', '🍿', 'Watched 10 episodes of one series in a single day.', s.maxEpisodesInDay, 10, 'episodes in a day'))
  badges.push(threshold('completionist', 'Completionist', '✅', 'Watched every episode of a series.', s.completedSeries, 1, 'series finished'))

  const critic = s.ratingCount >= 20 && s.avgRating !== null
  badges.push({
    id: 'harsh-critic',
    name: 'Harsh Critic',
    icon: '🧐',
    description: 'Average rating of 5 or lower across 20+ ratings. Hard to impress.',
    earned: critic && s.avgRating! <= 5,
    progress: s.ratingCount < 20 ? `${s.ratingCount} / 20 ratings` : undefined,
  })
  badges.push({
    id: 'easy-to-please',
    name: 'Easy to Please',
    icon: '🥰',
    description: 'Average rating of 8.5 or higher across 20+ ratings. Loves the movies.',
    earned: critic && s.avgRating! >= 8.5,
    progress: s.ratingCount < 20 ? `${s.ratingCount} / 20 ratings` : undefined,
  })

  badges.push(threshold('genre-explorer', 'Genre Explorer', '🧭', 'Rated titles across 10 different genres.', s.genreCount, 10, 'genres'))
  badges.push(threshold('time-traveler', 'Time Traveler', '⏳', 'Rated films from 6 different decades.', s.decadeCount, 6, 'decades'))
  badges.push(threshold('critics-pen', "Critic's Pen", '✍️', 'Wrote notes on 25 ratings.', s.notesCount, 25, 'notes'))
  badges.push(threshold('crowd-favorite', 'Crowd Favorite', '📣', 'Followed by 10 people.', s.followers, 10, 'followers'))

  // Earned first; otherwise keep the order above.
  return badges.map((b, i) => ({ b, i })).sort((x, y) => Number(y.b.earned) - Number(x.b.earned) || x.i - y.i).map(({ b }) => b)
}
