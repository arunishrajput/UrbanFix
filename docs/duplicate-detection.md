# Duplicate detection

Many people see the same pothole, and the biggest drain on a complaint system is the same problem filed fifty
times. UrbanFix's goal is to **steer duplicates into the existing issue** without blocking a genuinely new one.
Joining doesn't throw a citizen's report away: their photo becomes evidence on the existing issue, they become one of
its reporters, and its support and priority go up.

## When it runs

| Moment                            | What happens                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Citizen finishes the details step | `POST /issues/duplicates/check` with location, accuracy, category, description and uploaded photo IDs. Candidates are shown on a "Before you submit" screen with a mini-map.                                                                                                                                                                       |
| Citizen taps **Create new issue** | The candidate IDs are sent as `dismissedCandidateIds`.                                                                                                                                                                                                                                                                                             |
| `POST /issues`                    | The check runs again **on the server**. A _likely_ candidate that wasn't dismissed returns `409 DUPLICATE_SUSPECTED` with the candidates, so the UI can't be bypassed. If the citizen already reported a nearby issue, it returns `409 ALREADY_REPORTED`. Dismissed matches are saved on the report (`duplicate_override`) and shown to officials. |
| Afterwards                        | Officials can merge issues they spot as duplicates; reports, photos and supporters move to the target.                                                                                                                                                                                                                                             |

## Candidate search

```sql
-- open statuses only (PENDING, IN_PROGRESS, REOPENED, and RESOLVED-but-unverified), not merged
WHERE ST_DWithin(issues.location, :point, :radius)
ORDER BY issues.location <-> :point
LIMIT 30
```

- The **radius** is `clamp(max(category.duplicate_radius_m, 2 × GPS accuracy), 25 m, 250 m)`. Each category has its
  own base radius, from 30 m (pothole, footpath) to 60 m (tree, illegal dumping), and admins can edit it.
- **Resolved but unverified** issues are candidates on purpose. A fresh report of a problem that was just "resolved"
  is the strongest "still not fixed" signal there is, so joining one reopens it.
- The query uses the GiST index on the generated `geography` column. Only the nearest 30 issues are scored, which
  keeps the in-app similarity maths cheap.

## Scoring

The scoring code lives in `packages/shared/src/duplicates.ts`, is pure, and is unit-tested. Each candidate gets
five signals in [0, 1]:

| Signal       | Weight | How it is computed                                                                                                                                                                                                                                                |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **geo**      | 0.35   | `exp(-½ (d/σ)²)` with σ = radius/2. About 0.89 at 12 m for a 50 m radius; about 0.14 at the edge.                                                                                                                                                                 |
| **category** | 0.25   | 1 if the category is the same, 0.6 if it is related (garbage ↔ illegal dumping, pothole ↔ footpath, drain ↔ water leakage ↔ pipeline), 0 otherwise. Before the citizen picks a category, the AI-predicted one is used, then a keyword guess from the description. |
| **image**    | 0.25   | The best photo pair: an identical SHA-256 counts as 1; otherwise the higher of the Gemini image-embedding score and the perceptual-hash score (see below).                                                                                                        |
| **text**     | 0.10   | pg_trgm similarity between the new description plus AI captions and the candidate's title plus description, mapped `clamp((s − 0.1)/0.5)`.                                                                                                                        |
| **recency**  | 0.05   | `exp(−days since last activity / 30)`                                                                                                                                                                                                                             |

Signals that aren't available, such as a photo whose analysis hasn't finished or a report with no text, are left
out, and the remaining weights are renormalised. A missing signal never counts as evidence against a match.

Rules on top of the weighted score:

- **Unrelated category:** the candidate is dropped unless the photo match is ≥ 0.85 (the same photo filed under the
  wrong category).
- **Related category only:** capped just below "likely" unless the photos agree (≥ 0.6). This means a water leak 10 m
  from a drain issue is shown as _possible_, but doesn't block submission.

| Score       | Level                 | Effect                                                                                            |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| ≥ 0.75      | **Likely the same**   | Shown first and highlighted; the API refuses to create a new issue until the citizen dismisses it |
| 0.50 – 0.75 | **Possibly the same** | Shown                                                                                             |
| < 0.50      | n/a                   | Hidden                                                                                            |

**Example from the brief.** Same category, 12 m away, reported 2 days ago, photos not yet analysed:
`(0.35·0.89 + 0.25·1 + 0.05·0.94) / 0.65 ≈ 0.94`. That is _likely_, and the headline reads
_"There is already an open Garbage issue reported 12 meters away."_

## Photo similarity: why the two techniques are used differently

- **Perceptual hash** (64-bit DCT pHash computed with sharp) is robust to resizing and recompression, but it only
  recognises **near-identical** images. Two photos of the same garbage pile from different angles hash as differently
  as unrelated photos. So a pHash score below 0.5 is treated as _no information_: it can raise confidence, never lower
  it. The score is `clamp((similarity − 0.6) / 0.3)`, so a re-shot photo at about 0.875 similarity scores about 0.9.
- **Gemini multimodal embeddings** (`gemini-embedding-2`, 768 dimensions, renormalised) capture what a photo
  _shows_, so they are the one signal allowed to say "these photos are of different things".

Calibration measured with `gemini-embedding-2` while building this:

| Pair                                                       | Cosine      |
| ---------------------------------------------------------- | ----------- |
| Same scene, re-shot (cropped, rotated, brightness changed) | 0.982       |
| Same category, different scene                             | 0.969       |
| Different categories                                       | 0.84 – 0.88 |

Unrelated street scenes still score around 0.85, so the score maps cosine with a high floor:
`clamp((cos − 0.86) / 0.11)`. In the UI this produces "Similar photo" or "Very similar photo"; "Same photo" is
reserved for byte-identical files.

## Explanations shown to citizens

Each candidate carries readable reasons, so the citizen can judge for themselves: _Same category: Garbage · 12 m away
· Very similar photo · Similar description_. The card also shows the status, support count, reporter count and age,
plus a mini-map with a line from the citizen's pin to each candidate. When the citizen already reported a candidate,
the card offers "You reported this — view it" instead of "Join".

## Tuning and scaling

- Weights and thresholds are exported constants (`DUPLICATE_WEIGHTS`, `DUPLICATE_THRESHOLDS`), and per-category radii
  are editable by admins.
- `analytics → duplicates avoided` (reports that joined an existing issue) and the officials' merge actions are the
  feedback loop for tuning.
- Embeddings are stored as `real[]`, and cosine is computed in the app over at most 30 geo-filtered candidates. For
  city-wide image search (for example, the same photo submitted from different places), add `pgvector` with an HNSW
  index on `photos.embedding`. The scoring function doesn't change.
