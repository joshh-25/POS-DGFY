Create one horizontal animation strip for Codex pet `loki`, state `waving`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 4 full-body frames in one left-to-right row on flat pure blue #0000FF. Treat the row as 4 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Loki is a chubby orange tabby cat with bold black stripes, cream belly and muzzle, sleepy half-lidded sarcastic eyes, compact rounded proportions, and clean polished 2D mascot illustration styling. Preserve his established identity from the supplied contact-sheet reference. He hates Mondays and behaves like a real expressive cat. Lasagna is his signature comfort food. State requirements: jumping hover trigger is angry laptop smashing. waiting must be seated at a small open laptop while watching the screen and repeatedly eating or holding lasagna, mildly annoyed and expectant, no standing, no typing, no walking, no smashing. running remains seated at a small open laptop while watching the screen and repeatedly eating or holding lasagna, focused and mildly annoyed, no typing, no walking, no smashing. Keep all other states visually consistent with the current Loki asset. No text, speech bubbles, floating symbols, scenery, shadows, detached effects, speed lines, dust, or guide marks.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `auto`: Infer the most appropriate pet-safe style from the user request and reference images, then keep that exact style consistent across every row. User style notes: Match the established polished 2D orange-tabby mascot illustration exactly; crisp black outline, readable compact sprite silhouette..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Greeting loop: paw or limb down, raised, tilted, and returning in a friendly attention gesture.

State requirements:
- Show the greeting through paw, hand, wing, or limb pose only.
- Do not draw wave marks, motion arcs, lines, sparkles, symbols, or floating effects around the gesture.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.
