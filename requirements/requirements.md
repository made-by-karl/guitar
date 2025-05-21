# Guitar
This app should offer useful tools and informations for a novice guitar player.

## Requirements

### Technical Requirements
* The app is a PWA written in Angular
* The app uses Bootstrap as UI theme

### Features

#### Chords
* The app can visualize guitar chords.
    * It shows the position on the fretboard
    * It shows the correct positioning of fingers on the six strings of the guitar
    * It can visualize single fingers and barree grips
* the app has a library of many chords
    * the chords are described in /requirements/chords.json
        * the json format is:
            "C#":[{"positions":["x","4","3","1","2","1"],"fingerings":[["0","4","3","1","2","1"]]}]
            * The chord definition may listen multiple variations of grips for this chord
            * positions describes the tapped strings, where x means "do not play"
            * fingerings describes the fingers to use, each finger has an unique number. A number is used multiple times for a barree grip
            * some entries can contain null instead of a chord description and must be ignored
    * the library data is stored in a separate json file in the assets
* the app allows the user to browse the library of chords and visualizes the selected chord
* the app allows the user to play a midi with the selected chord
* the app offers a filter that operates on the chord name and hides non-matching chords

