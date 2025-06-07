# Guitar
This app should offer useful tools and information for a novice guitar player.

Requirements are annotated with [GA-n.m] where n refers to a chapter and m is a unique number in the chapter.

## Requirements

### Technical Requirements
* [GA-0.1] The app is a PWA written in Angular.
* [GA-0.2] The app uses Bootstrap as UI theme.
    * It should use a menu bar at the top that allows a user to switch between different main features.

### Features

#### Chords
* [GA-1.0] Chords is a main feature in the app with it's own page and menu entry
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

#### Song Sheets
* [GA-2.0] Song Sheets is a main feature in the app with its own page and menu entry
* [GA-2.1] The user can create a new Song Sheet by providing a name
* [GA-2.2] The user can add one or more selected grips (from the Chords feature) to a Song Sheet
* [GA-2.3] The user can (in the future) add strumming patterns to a Song Sheet
* [GA-2.4] The user can edit a Song Sheet (rename, add/remove grips, add/remove strumming patterns)
* [GA-2.5] The user can delete a Song Sheet
* [GA-2.6] All Song Sheets are persisted locally in the browser and restored on reload
* [GA-2.7] The user can view a list of all Song Sheets and select one to view or edit
* [GA-2.8] Each Song Sheet displays its name, the list of selected grips (with diagrams), and strumming patterns
* [GA-2.9] The user can play the MIDI sound for each grip in a Song Sheet
* [GA-2.10] The user can have many Song Sheets, representing their personal cheat sheets for favorite songs
* [GA-2.11] The app provides the pinning of a Song Sheet that can be activated everywhere from the UI and is clearly indicated in the header area
    * When a sheet is pinned, the user can add grips from the Chords feature to the currently selected Song Sheet
    * With a pinned sheet the user can also add strumming patterns and other elements
    * While a sheet is pinned, actions to add grips (e.g., "Add to Song Sheet" buttons) are available in the Chords feature

#### Rhythm Patterns
* [GA-3.0] Rhythm Patterns is a main feature in the app with its own page and menu entry
    * A rhythm pattern contains picking and strumming techniques
* [GA-3.1] The app provides a library of common rhythm patterns
    * Patterns include visual representations (arrows for up/down, timing grid, string selection, etc.)
    * Each pattern has a name and description
    * Patterns are categorized (e.g., by genre, time signature, difficulty)
* [GA-3.2] The user can preview (play back) rhythm patterns as MIDI or audio
    * Playback reflects the rhythm, direction, and string selection of the pattern
* [GA-3.3] The user can create, edit, and delete custom rhythm patterns
    * The editor allows:
        * Setting the time signature (e.g., 4/4, 3/4, 6/8, 12/8)
        * Defining a sequence of steps, where each step specifies:
            * The technique (strum, pick, mute, rest, accent, palm mute, percussive hit, etc.)
            * The direction (downstroke, upstroke) if applicable
            * Which string(s) are played (e.g., pick string 6, strum strings 4-1, strum only high strings, pick multiple strings)
        * Adjusting tempo (BPM)
        * Naming and saving the pattern
* [GA-3.4] The user can add rhythm patterns to Song Sheets
    * Patterns can be associated with specific chords or sections
* [GA-3.5] All custom rhythm patterns are persisted locally and restored on reload
* [GA-3.6] The user can view, search, and filter the rhythm pattern library
* [GA-3.7] The following techniques are supported in patterns:
    * Downstroke (D)
    * Upstroke (U)
    * Muted/Chop (X)
    * Pause/Rest (-)
    * Accented stroke (A)
    * Palm mute (PM)
    * Percussive hit (P)
    * Picking individual strings (by string number or name)
    * Hybrid picking (pick bass, strum treble)
    * Arpeggios and fingerstyle patterns
    * Travis picking, alternating bass
    * Classical/fingerstyle patterns
    * Muted picking, percussive hits
    * Strumming only selected strings (e.g., low, high, or mid strings)
    * Skipping strings during strum (e.g., strum 4-1 only)
    * Accented strums, palm mute, percussive hits
* [GA-3.8] The following common patterns are available:
    * Downstrokes only (D D D D)
    * Down-Up alternating (D U D U)
    * Folk/pop (D D U U D U)
    * Waltz (3/4: D D U)
    * Reggae (offbeat upstrokes)
    * Shuffle/Swing
    * Syncopated, triplets, 6/8, 12/8, flamenco, funk, etc.
    * "Pick bass, strum rest" hybrid patterns
    * Arpeggios, fingerstyle, and Travis picking patterns
