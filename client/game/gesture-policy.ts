// Pure pointer-gesture rules for the city map. Kept free of Phaser so they can be unit tested.
// Invariant: on touch, moving the map never spends money. Building on touch needs a deliberate
// second tap on the previewed tile, the Build button, or an explicit Draw mode.

export interface GestureContext {
  /** True when no construction tool is selected. */
  inspecting: boolean;
  /** The active pointer is a finger or pen rather than a mouse. */
  touch: boolean;
  /** Player switched on Draw mode from the construction bar (touch only). */
  drawMode: boolean;
  /** Mouse right button held. */
  rightButton: boolean;
  /** Two or more fingers are, or were, on the screen during this gesture. */
  multiTouch: boolean;
}

/** Mouse: pressing with a tool selected builds straight away, as before. Touch never builds on press. */
export function pressBuildsImmediately(c: GestureContext) {
  return !c.inspecting && !c.touch && !c.rightButton && !c.multiTouch;
}

/** What a one-pointer drag does. */
export function dragIntent(c: GestureContext): 'pan' | 'paint' {
  if (c.inspecting || c.rightButton || c.multiTouch) return 'pan';
  if (c.touch && !c.drawMode) return 'pan';
  return 'paint';
}

/** What a tap (press and release without dragging) does. */
export function tapIntent(c: GestureContext & { sameAsPreview: boolean }): 'select' | 'preview' | 'build' | 'none' {
  if (c.inspecting) return 'select';
  if (!c.touch) return 'none';
  return c.sameAsPreview ? 'build' : 'preview';
}

/** Whether the hover/preview highlight should follow the pointer while it moves. */
export function followsPointer(c: GestureContext) {
  if (!c.touch) return true;
  return !c.inspecting && c.drawMode && !c.multiTouch;
}
