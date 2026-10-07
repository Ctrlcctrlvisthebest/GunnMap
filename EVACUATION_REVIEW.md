# Reviewing evacuation evidence

The September 3, 2026 campus site map identifies room locations. It contains no
evacuation routes or assembly areas. The evidence review on October 3, 2026 did
not have a current school-issued evacuation plan to verify. All room assignments
therefore remain **unconfirmed**; the earlier annotated reference must not be
reused for the new layout.

## What the application records

`src/data/evacuation_data.json` separates source provenance from its review:

- `provenance` records the supplied source filename, repository PNG path, image
  SHA-256, pixel dimensions, source revision date, and school-plan verification
  date. A campus site map has `sourceKind: "official_site_map"` and
  `verifiedOn: null`.
- `review` records the last evidence-check date and reviewer, notes, remaining
  evidence, the campus map revision, and the room inventory SHA-256. The current
  status is `pending_school_plan`, with `verifiedBy: null`.
- `routesAvailable` stays `false`, and `groups`, `ranges`, `exact`, and `whole`
  stay empty until verification is complete.

The page exposes the source, last evidence review, plan verification status and
remaining evidence. An evidence-check date is not a school-plan verification date.

## Completing a future review

1. Obtain a current school-issued evacuation plan and confirmation from school
   staff that it applies to the September 2026 campus layout. Keep the original
   filename and source document. Add a faithful PNG reference under `src/map/`;
   retain its original pixel dimensions. Do not repurpose the campus site-map
   image as evacuation evidence.
2. Record the plan's source revision date, PNG SHA-256, dimensions and source path.
   Set `provenance.sourceKind` to `official_evacuation_plan` only for the actual
   school plan. Record when it was verified and the person who confirmed its
   applicability in `review.verifiedBy`; include the confirmation basis in
   `review.note`.
3. Verify every proposed room assignment against the current selectable inventory
   and the plan. Record only explicit destinations and reference coordinates.
   Leave unsupported rooms unassigned. Document source-only labels in
   `inventoryExceptions`; do not guess correspondences from similar numbers or
   building names.
4. Bind the review to `MAP_REVISION` from `src/map_revision.ts` and the SHA-256 of
   the exact `src/data/room_regions.json` file. The revision includes both the
   campus PNG and the inventory. A change to either requires another review.
5. Set `review.status` to `verified_school_plan`, clear `missingEvidence`, and
   explicitly set `routesAvailable: true` only after the evidence and assignments
   are complete. A verification date cannot precede the source or current campus
   map revision; the evidence-check date cannot precede verification.
6. Run `npm run data:validate`, `npm run typecheck`, `npm test` and
   `npm run build`. Inspect room and period details, repeated-room markers, and
   the plan's reference coordinates. Keep the normal repository review process.

Validation checks file fingerprints and dimensions, review dates, verified-plan
source kind, required evidence, inventory coverage and overlapping assignments.
The server returns unconfirmed destinations when any validation issue exists.
These checks establish consistency; school staff must still verify the content.
Always follow current school staff directions during an emergency.

## Saved schedules and map updates

The evacuation page checks each saved room ID and map revision against the current
inventory before requesting its marker. Legacy, stale or changed identities are
shown as needing review, with a link to Schedule Map. Confirming a room's location
does not confirm its evacuation destination.
