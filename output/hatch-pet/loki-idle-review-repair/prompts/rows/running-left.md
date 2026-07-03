Create one horizontal animation strip for Codex pet `loki`, state `running-left`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 8 full-body frames in one left-to-right row on flat pure blue #0000FF. Treat the row as 8 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Loki is a chubby orange tabby cat with bold black stripes, cream belly and muzzle, sleepy half-lidded sarcastic eyes, compact rounded proportions, and clean polished 2D mascot illustration styling. Preserve his established identity from the supplied contact-sheet reference. Lasagna is his signature comfort food. jumping hover trigger remains angry laptop smashing. waiting remains seated at a small open laptop while watching the screen and repeatedly eating or holding lasagna. running remains seated at a small open laptop while watching the screen and repeatedly eating or holding lasagna. idle must now also be seated at a small open laptop while calmly watching the screen and holding or nibbling lasagna with subtle quiet motion, no standing. review must also be seated at a small open laptop while inspecting the screen and holding or nibbling lasagna with focused judgmental expression, no standing. No typing, no walking, no smashing outside hover, no text, no scenery, no detached effects.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `auto`: Infer the most appropriate pet-safe style from the user request and reference images, then keep that exact style consistent across every row. User style notes: Match the established polished 2D orange-tabby mascot illustration exactly; crisp black outline, readable compact sprite silhouette..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Dragging-left loop: show directional movement to the left through body and limb poses only.

State requirements:
- Show directional drag movement to the left through body, limb, and prop movement only.
- The row must unmistakably face and travel left.
- The movement cadence must alternate visibly across the 8 frames instead of repeating one nearly static stride.
- Do not draw speed lines, dust clouds, floor shadows, motion trails, or detached motion effects.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.
