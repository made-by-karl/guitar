# Guitar
This app should offer useful tools and information for a novice guitar player.

Requirements are annotated with [GA-n.m] where n refers to a chapter and m is a unique number in the chapter.

## Requirements

### Technical Requirements
* [GA-0.1] The app is a PWA written in Angular.
* [GA-0.2] The app uses Bootstrap as the UI theme.

### Features

#### Chords
* [GA-1.1] The app dynamically generates grips for chords.
    * The grips are calculated based on chord formulas (root, modifiers, optional bass).
    * The app supports ergonomic constraints, such as limiting fret spans and ensuring playable strings.
    * The app allows customization of grip generation settings, including:
        * Allow muted strings inside.
        * Minimum fret to consider.
        * Maximum fret to consider.
        * Minimal playable strings.
        * Allow barree grips.
        * Allow inversions.
        * Allow incomplete chords.
        * Allow duplicated notes (chord sounds boring)
* [GA-1.2] The app allows the user to build chords dynamically.
    * Users can select the root note, modifiers, and optional bass note via a user-friendly interface.
    * Modifiers are displayed as toggle buttons styled with Bootstrap.
    * Conflicting modifiers are dynamically disabled.
* [GA-1.3] The app allows the user to play a MIDI representation of the selected chord.
* [GA-1.4] The app visualizes the dynamically generated grips for the selected chord.
    * It shows multiple variations of grips for the chord.
    * It displays the tapped strings and finger positions.
    * It supports visualization of barree grips and single-finger placements.