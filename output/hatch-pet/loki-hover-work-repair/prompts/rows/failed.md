Create one horizontal animation strip for Codex pet `loki`, state `failed`.

Use the attached canonical base for identity. Use the attached layout guide only for slot count, spacing, centering, and padding; do not draw the guide.

Output exactly 8 full-body frames in one left-to-right row on flat pure blue #0000FF. Treat the row as 8 invisible equal-width slots: one centered complete pose per slot, evenly spaced, with no overlap, clipping, empty slots, labels, or borders.

Identity: same pet in every frame: Loki is a chubby orange tabby cat with bold black stripes, cream belly and muzzle, sleepy half-lidded sarcastic eyes, compact rounded proportions, and clean polished 2D mascot illustration styling. Preserve his established identity from the supplied contact-sheet reference. He hates Mondays and behaves like a real expressive cat: slow blinks, ear turns, tail flicks, loafing, paw gestures, crouches, trots, pounces, and judgmental staring. Lasagna is his signature comfort food. State requirements: idle sleepy slow blink, subtle breathing, ear twitch, small tail flick, no prop interaction. running-right/running-left low catlike scamper with alternating paws and tail balance. waving reluctant lazy paw wave with unimpressed expression. jumping hover trigger: angry Monday tantrum where Loki physically raises a paw and smashes a small open laptop; laptop remains attached or touching the sprite, with no detached debris, symbols, or effects. failed blocked reaction may be frustrated but do not rely on hover semantics. waiting expectant stare, ears forward, one asking paw, impatient tail motion. running active work state: seated at a small open laptop while watching the screen and repeatedly eating or holding lasagna, focused and mildly annoyed; no typing, no walking, no smashing. review judgmental inspection with narrowed eyes, head tilt, and deliberate paw position. No text, speech bubbles, floating symbols, scenery, shadows, detached effects, speed lines, dust, or guide marks.. Preserve silhouette, face, proportions, markings, palette, material, style, and props.
Style: Pet-safe sprite: compact full-body mascot, readable in a 192x208 cell, clear silhouette, simple face, stable palette/materials, and crisp edges for chroma-key extraction. Style `auto`: Infer the most appropriate pet-safe style from the user request and reference images, then keep that exact style consistent across every row. User style notes: Match the established polished 2D orange-tabby mascot illustration exactly; crisp black outline, readable compact sprite silhouette..
Animation continuity: keep apparent pet scale and baseline stable within the row unless the state itself intentionally changes vertical position, such as `jumping`. Move the pose within the slot instead of redrawing the pet larger or smaller frame to frame.

State action: Blocked/failed loop: slumped or deflated reaction with sad or closed eyes.

State requirements:
- Show failure through slumped pose, drooping ears/limbs, closed or sad eyes, and lower body position.
- Tears, small smoke puffs, or tiny stars are allowed only if attached to or overlapping the pet silhouette and kept inside the same frame slot.
- Do not draw red X marks, floating symbols, detached stars, separated smoke clouds, falling tear drops, dust, or other loose effects.

Clean extraction: crisp opaque edges, safe padding, no scenery, text, guide marks, checkerboard, shadows, glows, motion blur, speed lines, dust, detached effects, stray pixels, or chroma-key colors inside the pet.
