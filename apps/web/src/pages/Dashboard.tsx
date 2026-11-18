import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import MovieSearch, { type SearchResult } from "../components/MovieSearch";
import MovieDetail from "../components/MovieDetail";
import RateMovie from "./RateMovie";
import Dialog, { CloseButton } from "../components/Dialog";

interface Movie {
  id: string;
  tmdb_id: number;
  title: string;
  release_year: number | null;
  poster_path: string | null;
  media_type: string;
}

interface Rating {
  id: string;
  movie_id: string;
  user_id: string;
  rating: number;
  description: string | null;
  created_at: string;
  movie: Movie;
  profile: { username: string; avatar_url: string | null };
}

interface FeaturedMovie extends Movie {
  avg_score: number;
  rating_count: number;
}

async function loadRecentRatings(): Promise<Rating[]> {
  const { data: ratingRows, error } = await supabase
    .from("ratings")
    .select("id, movie_id, user_id, rating, description, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !ratingRows?.length) {
    if (error) console.error("Recent ratings error:", error);
    return [];
  }

  const movieIds = [...new Set(ratingRows.map((row) => row.movie_id))];
  const userIds = [...new Set(ratingRows.map((row) => row.user_id))];
  const [{ data: movies }, { data: profiles }] = await Promise.all([
    supabase.from("movies").select("id, tmdb_id, title, release_year, poster_path, media_type").in("id", movieIds),
    supabase.from("profiles").select("id, username, avatar_url").in("id", userIds),
  ]);
  const moviesById = new Map((movies || []).map((movie) => [movie.id, movie as unknown as Movie]));
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return ratingRows.flatMap((row) => {
    const movie = moviesById.get(row.movie_id);
    if (!movie) return [];
    return [{
      ...row,
      movie,
      profile: profilesById.get(row.user_id) || { username: "Friend", avatar_url: null },
    } as unknown as Rating];
  });
}

interface ReactionSummary {
  likes: number;
  dislikes: number;
  mine: "like" | "dislike" | null;
}

interface Comment {
  id: string;
  rating_id: string;
  user_id: string;
  content: string;
  profile: { username: string } | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [featured, setFeatured] = useState<FeaturedMovie | null>(null);
  const [featuredRow, setFeaturedRow] = useState<FeaturedMovie[]>([]);
  const [boxOffice, setBoxOffice] = useState<SearchResult[]>([]);
  const [recommended, setRecommended] = useState<SearchResult[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [recommendationOffset, setRecommendationOffset] = useState(0);
  const [dismissedRecommendations, setDismissedRecommendations] = useState<Set<number>>(new Set());
  const [recentRatings, setRecentRatings] = useState<Rating[]>([]);
  const [loggedMovies, setLoggedMovies] = useState<Movie[]>([]);
  const [myRatedTmdbIds, setMyRatedTmdbIds] = useState<Set<number>>(new Set());
  const [reactionSummary, setReactionSummary] = useState<Record<string, ReactionSummary>>({});
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [socialAction, setSocialAction] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [logStep, setLogStep] = useState<"search" | "detail" | "rate" | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<SearchResult | null>(null);

  const displayName = user?.email?.split("@")[0] || "Guest";

  const dismissRecommendation = async (movie: SearchResult) => {
    if (!user) return;
    setDismissedRecommendations((current) => new Set(current).add(movie.tmdb_id));
    setRecommended((current) => current.filter((item) => item.tmdb_id !== movie.tmdb_id));
    await supabase.from("recommendation_feedback").upsert({ user_id: user.id, tmdb_id: movie.tmdb_id });
  };

  const loadSocialData = async (ratingIds: string[]) => {
    if (!user || ratingIds.length === 0) return;
    const [{ data: reactions }, { data: commentRows }] = await Promise.all([
      supabase.from("reactions").select("rating_id, user_id, reaction").in("rating_id", ratingIds),
      supabase.from("comments").select("id, rating_id, user_id, content, profile:profiles(username)").in("rating_id", ratingIds).order("created_at"),
    ]);
    const summary: Record<string, ReactionSummary> = {};
    (reactions || []).forEach((reaction) => {
      const current = summary[reaction.rating_id] || { likes: 0, dislikes: 0, mine: null };
      if (reaction.reaction === "like") current.likes += 1;
      if (reaction.reaction === "dislike") current.dislikes += 1;
      if (reaction.user_id === user.id) current.mine = reaction.reaction;
      summary[reaction.rating_id] = current;
    });
    const grouped: Record<string, Comment[]> = {};
    (commentRows || []).forEach((comment) => {
      (grouped[comment.rating_id] ||= []).push(comment as unknown as Comment);
    });
    setReactionSummary(summary);
    setComments(grouped);
  };

  const toggleReaction = async (ratingId: string, reaction: "like" | "dislike") => {
    if (!user) return;
    setSocialAction(`${ratingId}:${reaction}`);
    setSocialError(null);
    const mine = reactionSummary[ratingId]?.mine;
    if (mine === reaction) {
      await supabase.from("reactions").delete().eq("rating_id", ratingId).eq("user_id", user.id);
    } else {
      await supabase.from("reactions").upsert({ rating_id: ratingId, user_id: user.id, reaction }, { onConflict: "rating_id,user_id" });
    }
    setSocialAction(null);
    await loadSocialData(recentRatings.map((rating) => rating.id));
  };

  const addComment = async (ratingId: string) => {
    if (!user) return;
    const content = commentDrafts[ratingId]?.trim();
    if (!content) return;
    setSocialAction(`${ratingId}:comment`);
    setSocialError(null);
    const { error } = await supabase.from("comments").insert({ rating_id: ratingId, user_id: user.id, content });
    if (!error) {
      setCommentDrafts((drafts) => ({ ...drafts, [ratingId]: "" }));
      await loadSocialData(recentRatings.map((rating) => rating.id));
    } else {
      setSocialError("Your comment didn’t post. Try again.");
    }
    setSocialAction(null);
  };

  const deleteComment = async (comment: Comment) => {
    if (!user) return;
    const { error } = await supabase.from("comments").delete().eq("id", comment.id);
    if (!error) {
      setComments((current) => ({
        ...current,
        [comment.rating_id]: (current[comment.rating_id] || []).filter((item) => item.id !== comment.id),
      }));
    } else {
      setSocialError("That comment couldn’t be deleted. Try again.");
    }
  };

  const fetchRecommendations = async (loggedTmdbIds: Set<number>) => {
    if (!user) return;

    setRecommendationsLoading(true);
    setRecommendationError(null);

    try {
      const [{ data: myRatings }, { data: myTop5 }] = await Promise.all([
        supabase
          .from("ratings")
          .select("rating, movie:movies(tmdb_id, media_type)")
          .eq("user_id", user.id)
          .order("rating", { ascending: false })
          .limit(5),
        supabase
          .from("top5_items")
          .select("rank, movie:movies(tmdb_id, media_type)")
          .eq("user_id", user.id)
          .order("rank")
          .limit(5),
      ]);

    const seeds = [...(myRatings || []), ...(myTop5 || [])]
      .map((row) => row.movie as unknown as { tmdb_id: number; media_type: string } | null)
      .filter((movie): movie is { tmdb_id: number; media_type: string } => Boolean(movie))
      .filter((movie, index, all) => all.findIndex((candidate) => candidate.tmdb_id === movie.tmdb_id) === index)
      .slice(0, 5);

      if (seeds.length === 0) {
        setRecommendationError("Rate a film or add a Top 5 pick to get recommendations.");
        return;
      }

      const rotatedSeeds = seeds.length > 1
        ? seeds.map((_, index) => seeds[(index + recommendationOffset) % seeds.length])
        : seeds;
      const mediaType = rotatedSeeds.every((seed) => seed.media_type === "tv") ? "tv" : "movie";
      const seedIds = rotatedSeeds.filter((seed) => seed.media_type === mediaType).map((seed) => seed.tmdb_id);
      const res = await fetch(`/api/tmdb/Recommendations?tmdb_ids=${seedIds.join(",")}&media_type=${mediaType}&refresh=${Date.now()}`);
      if (!res.ok) throw new Error("Recommendations request failed");
      const data = await res.json();
      const filtered = (data.results || []).filter((r: SearchResult) => !loggedTmdbIds.has(r.tmdb_id) && !dismissedRecommendations.has(r.tmdb_id));
      setRecommended(filtered.slice(0, 8));
    } catch (error) {
      console.error("Recommendations error:", error);
      setRecommendationError("Picks didn’t load. Try Show other picks again in a moment.");
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const fetchBoxOffice = async () => {
    const res = await fetch("/api/tmdb/boxoffice");
    if (!res.ok) throw new Error("Box office request failed");
    const data = await res.json();
    setBoxOffice(data.results || []);
  };

  const fetchHomeData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(null);

    // Each piece loads independently with its own timeout, so one slow or
    // broken call (e.g. vercel dev not running) can't freeze the whole page.
    const withTimeout = <T,>(promise: PromiseLike<T>, ms = 8000): Promise<T | null> =>
      Promise.race([
        Promise.resolve(promise),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]).catch((err) => {
        console.error(err);
        return null;
      });

    const results = await Promise.allSettled([
      withTimeout(supabase.rpc("get_featured_movie").maybeSingle()),
      withTimeout(supabase.rpc("get_featured_movies", { limit_count: 8 })),
      withTimeout(
        loadRecentRatings()
      ),
      withTimeout(
        supabase.from("movies").select("*").order("created_at", { ascending: false }).limit(12)
      ),
      withTimeout(
        supabase.from("ratings").select("movie:movies(tmdb_id)").eq("user_id", user?.id || "")
      ),
    ]);

    const [featuredRes, featuredRowRes, ratingsRes, moviesRes, myRatingsRes] = results;

    if (featuredRes.status === "fulfilled" && featuredRes.value?.data) {
      setFeatured(featuredRes.value.data as FeaturedMovie);
    }
    if (featuredRowRes.status === "fulfilled" && featuredRowRes.value?.data) {
      setFeaturedRow(featuredRowRes.value.data as FeaturedMovie[]);
    }
    if (ratingsRes.status === "fulfilled" && ratingsRes.value) {
      const ratings = ratingsRes.value as Rating[];
      setRecentRatings(ratings);
      const ratedMovies = Array.from(
        new Map(ratings.map((rating) => [rating.movie.id, rating.movie])).values()
      );
      setLoggedMovies(ratedMovies);
      void loadSocialData(ratings.map((rating) => rating.id));
    }
    if (myRatingsRes.status === "fulfilled" && myRatingsRes.value?.data) {
      setMyRatedTmdbIds(
        new Set(
          myRatingsRes.value.data.flatMap((row) => {
            const movie = row.movie as unknown as { tmdb_id: number } | null;
            return movie ? [movie.tmdb_id] : [];
          })
        )
      );
    }

    let moviesData: Movie[] | null = null;
    if (moviesRes.status === "fulfilled" && moviesRes.value?.data) {
      moviesData = moviesRes.value.data;
    }

    // Show the dashboard before slower TMDB feeds finish loading.
    if (showLoading) setLoading(false);

    try {
      await withTimeout(fetchBoxOffice());
    } catch (err) {
      console.error(err);
    }

    if (moviesData) {
      // Recommendations hit our own /api proxy (not Supabase), so it gets
      // its own timeout/error handling separately.
      try {
        await withTimeout(fetchRecommendations(new Set(moviesData.map((m) => m.tmdb_id))));
      } catch (err) {
        console.error(err);
      }
    }

    const anyFailed = results.some(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === null)
    );
    if (anyFailed) {
      setLoadError(
        "Some data didn't load — check that both `npx vercel dev` and `npm run dev` are running."
      );
    }

    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    fetchHomeData();
  }, []);

  const closeLogFlow = () => {
    setLogStep(null);
    setSelectedMovie(null);
  };

  const handleLogDone = () => {
    closeLogFlow();
    void fetchHomeData(false);
  };

  const openMovieDetails = (item: Movie | FeaturedMovie | SearchResult) => {
    setSelectedMovie({
      tmdb_id: item.tmdb_id,
      title: item.title,
      poster_path: item.poster_path,
      release_year: item.release_year == null ? null : String(item.release_year),
      media_type: item.media_type === "tv" ? "tv" : "movie",
    });
    setLogStep("detail");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <NavBar />
        <main className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading your home page">
          <div className="space-y-3">
            <div className="skeleton h-14 w-72 rounded-lg" />
            <div className="skeleton h-4 w-96 max-w-full rounded" />
          </div>
          {[0, 1].map((row) => (
            <div key={row} className="space-y-4">
              <div className="skeleton h-7 w-56 rounded" />
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className="skeleton aspect-[2/3] w-[150px] shrink-0 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </main>
      </div>
    );
  }

  const PosterRow = ({
    title,
    subtitle,
    items,
    emptyText,
    showScore = false,
    action,
    footer,
    onHide,
  }: {
    title: string;
    subtitle?: string;
    items: (Movie | FeaturedMovie | SearchResult)[];
    emptyText: string;
    showScore?: boolean;
    action?: React.ReactNode;
    footer?: React.ReactNode;
    onHide?: (item: SearchResult) => void;
  }) => (
    <section aria-label={title}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-extrabold">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {action}
      </div>

      {items.length > 0 ? (
        <ul className="rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          {items.map((item, idx) => {
            const itemTitle = "title" in item ? item.title : "";
            const year = "release_year" in item ? item.release_year : null;
            const score = "avg_score" in item ? (item as FeaturedMovie).avg_score : null;
            const key = "id" in item ? item.id : `${(item as SearchResult).media_type}-${(item as SearchResult).tmdb_id}-${idx}`;

            return (
              <li key={key} className="group w-[136px] shrink-0 sm:w-[150px]">
                <button
                  type="button"
                  onClick={() => openMovieDetails(item)}
                  className="block w-full rounded-xl text-left"
                >
                  <span className="relative block aspect-[2/3] overflow-hidden rounded-xl bg-raised shadow-poster transition-transform duration-200 group-hover:-translate-y-1">
                    {item.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w300${item.poster_path}`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center p-3 text-center font-display text-xl font-bold text-ink-muted">
                        {itemTitle}
                      </span>
                    )}
                    {showScore && score != null && (
                      <span className="ticket absolute right-2 top-2 text-base">{score.toFixed(1)}</span>
                    )}
                  </span>
                  <span className="mt-2.5 block truncate text-sm font-semibold">{itemTitle}</span>
                  <span className="block text-xs text-ink-muted">{year || "Year unknown"}</span>
                </button>
                {onHide && (
                  <button
                    type="button"
                    aria-label={`Not interested in ${itemTitle}`}
                    onClick={() => onHide(item as SearchResult)}
                    className="mt-1 text-xs font-medium text-ink-muted underline-offset-2 hover:text-brand hover:underline"
                  >
                    Not interested
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">{emptyText}</div>
      )}
      {footer}
    </section>
  );

  const reactionButton = (ratingId: string, kind: "like" | "dislike") => {
    const summary = reactionSummary[ratingId];
    const active = summary?.mine === kind;
    const count = kind === "like" ? summary?.likes || 0 : summary?.dislikes || 0;
    const busy = socialAction === `${ratingId}:${kind}`;
    return (
      <button
        type="button"
        onClick={() => void toggleReaction(ratingId, kind)}
        aria-pressed={active}
        aria-label={`${kind === "like" ? "Like" : "Dislike"} (${count})`}
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
          active ? "bg-brand/15 text-brand" : "text-ink-muted hover:bg-raised hover:text-ink"
        }`}
      >
        <svg viewBox="0 0 24 24" className={`h-4 w-4 ${kind === "dislike" ? "rotate-180" : ""}`} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinejoin="round" d="M7 11v9H4v-9h3zm0 0l4-8a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.2 7A2 2 0 0117.3 20H7" />
        </svg>
        <span className="tabular">{count}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <NavBar onSearch={() => setLogStep("search")} />

      <main className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6">
        {loadError && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {loadError}
          </div>
        )}

        <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-[clamp(3rem,8vw,5.5rem)] font-black uppercase leading-[0.85]">
              Now showing
            </h1>
            <p className="mt-3 max-w-lg text-ink-muted">
              Hi {displayName}. Here's what's out, what your friends are watching, and what you might like next.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLogStep("search")}
            className="self-start rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:border-brand hover:text-brand sm:self-auto"
          >
            Find a film to log
          </button>
        </section>

        <PosterRow
          title="In theaters this week"
          subtitle="New releases and the most watched films right now."
          items={boxOffice.length > 0 ? boxOffice : featuredRow}
          showScore={boxOffice.length === 0}
          emptyText="Nothing to show yet. Current releases appear here once the movie database connects."
        />

        <PosterRow
          title="Picked for you"
          subtitle="Based on your highest ratings and your Top 5."
          items={recommended}
          onHide={(movie) => void dismissRecommendation(movie)}
          emptyText={recommendationsLoading ? "Finding films you might like…" : "Rate a few films or set your Top 5 to get picks here."}
          action={
            <button
              type="button"
              onClick={() => {
                setRecommendationOffset((offset) => offset + 1);
                void fetchRecommendations(new Set(loggedMovies.map((movie) => movie.tmdb_id)));
              }}
              disabled={recommendationsLoading}
              className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
            >
              {recommendationsLoading ? "Refreshing…" : "Show other picks"}
            </button>
          }
          footer={recommendationError && <p className="mt-3 text-sm text-ink-muted">{recommendationError}</p>}
        />

        <PosterRow
          title="Your friends are watching"
          subtitle="The latest films logged by the group."
          items={loggedMovies}
          emptyText="No one has logged a film yet. Log yours and it shows up here for everyone."
        />

        <section className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="font-display text-3xl font-extrabold">Latest ratings</h2>
            <p className="mt-1 text-sm text-ink-muted">React or comment on what your friends logged.</p>
            {socialError && (
              <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger">
                {socialError}
              </p>
            )}

            <ol className="mt-5 space-y-3">
              {recentRatings.length > 0 ? (
                recentRatings.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                    <button type="button" onClick={() => openMovieDetails(r.movie)} className="flex w-full gap-4 rounded-lg text-left">
                      <span className="h-[5.25rem] w-14 shrink-0 overflow-hidden rounded-lg bg-raised">
                        {r.movie.poster_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w200${r.movie.poster_path}`}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink-muted">
                          <span className="font-semibold text-ink">{r.profile?.username || "A friend"}</span> rated
                        </span>
                        <span className="mt-0.5 block truncate font-semibold">{r.movie.title}</span>
                        {r.description && (
                          <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">{r.description}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 flex-col items-end justify-between gap-2">
                        <span className="ticket text-xl">{Number(r.rating).toFixed(1)}</span>
                        <time dateTime={r.created_at} className="text-xs text-ink-muted">
                          {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </time>
                      </span>
                    </button>

                    <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
                      {reactionButton(r.id, "like")}
                      {reactionButton(r.id, "dislike")}
                      <span className="ml-auto text-xs text-ink-muted">
                        {comments[r.id]?.length || 0} {comments[r.id]?.length === 1 ? "comment" : "comments"}
                      </span>
                    </div>

                    {comments[r.id]?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {comments[r.id].slice(-3).map((comment) => (
                          <li key={comment.id} className="flex items-start justify-between gap-3 text-sm">
                            <p className="min-w-0">
                              <span className="font-semibold">{comment.profile?.username || "A friend"}</span>{" "}
                              <span className="text-ink-muted">{comment.content}</span>
                            </p>
                            {(comment.user_id === user?.id || r.user_id === user?.id) && (
                              <button
                                type="button"
                                onClick={() => void deleteComment(comment)}
                                className="shrink-0 text-xs font-medium text-ink-muted hover:text-danger"
                              >
                                Delete
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addComment(r.id);
                      }}
                    >
                      <label htmlFor={`comment-${r.id}`} className="sr-only">
                        Comment on {r.profile?.username || "this"} rating of {r.movie.title}
                      </label>
                      <input
                        id={`comment-${r.id}`}
                        value={commentDrafts[r.id] || ""}
                        onChange={(event) => setCommentDrafts((drafts) => ({ ...drafts, [r.id]: event.target.value }))}
                        placeholder="Add a comment"
                        maxLength={500}
                        className="min-w-0 flex-1 rounded-full border border-line bg-raised px-4 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={socialAction === `${r.id}:comment` || !commentDrafts[r.id]?.trim()}
                        className="rounded-full px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10 disabled:text-ink-muted disabled:hover:bg-transparent"
                      >
                        {socialAction === `${r.id}:comment` ? "Posting…" : "Post"}
                      </button>
                    </form>
                  </li>
                ))
              ) : (
                <li className="rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">
                  No ratings yet. When someone in your group logs a film, it shows up here.
                </li>
              )}
            </ol>
          </div>

          <aside aria-labelledby="featured-title" className="lg:sticky lg:top-24 lg:self-start">
            <h2 id="featured-title" className="font-display text-3xl font-extrabold">Group favorite</h2>
            <p className="mt-1 text-sm text-ink-muted">The best-rated film across everyone's logs.</p>

            {featured ? (
              <button
                type="button"
                onClick={() => openMovieDetails(featured)}
                className="group mt-5 block w-full overflow-hidden rounded-2xl border border-line bg-surface text-left"
              >
                <span className="relative block aspect-[16/10] overflow-hidden bg-raised">
                  {featured.poster_path && (
                    <img
                      src={`https://image.tmdb.org/t/p/w500${featured.poster_path}`}
                      alt=""
                      className="h-full w-full object-cover object-[center_20%] transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" aria-hidden="true" />
                </span>
                <span className="relative -mt-16 flex items-end justify-between gap-4 px-5 pb-5">
                  <span className="min-w-0">
                    <span className="block font-display text-3xl font-extrabold leading-none">{featured.title}</span>
                    <span className="mt-2 block text-sm text-ink-muted">
                      {featured.release_year ?? "Year unknown"}, {featured.rating_count} {featured.rating_count === 1 ? "rating" : "ratings"}
                    </span>
                  </span>
                  <span className="ticket shrink-0 text-3xl">{featured.avg_score?.toFixed(1) ?? "–"}</span>
                </span>
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">
                Once a few films are rated, the group's top pick appears here.
              </div>
            )}
          </aside>
        </section>
      </main>

      {logStep === "search" && (
        <Dialog onClose={closeLogFlow} title="Find a film to log" align="top" bare>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-dialog">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="font-display text-2xl font-extrabold">Find a film to log</p>
              <CloseButton onClick={closeLogFlow} />
            </div>
            <MovieSearch
              onSelect={(result) => {
                setSelectedMovie(result);
                setLogStep("detail");
              }}
            />
          </div>
        </Dialog>
      )}

      {logStep === "detail" && selectedMovie && (
        <MovieDetail
          movie={selectedMovie}
          alreadyRated={myRatedTmdbIds.has(selectedMovie.tmdb_id)}
          onRate={() => setLogStep("rate")}
          onClose={closeLogFlow}
        />
      )}

      {logStep === "rate" && selectedMovie && (
        <RateMovie movie={selectedMovie} onDone={handleLogDone} onCancel={closeLogFlow} />
      )}
    </div>
  );
}
