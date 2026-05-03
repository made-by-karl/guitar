import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Grip } from '@/app/features/grips/services/grips/grip.model';

@Component({
  selector: 'app-grip-diagram',
  imports: [],
  templateUrl: './grip-diagram.component.html',
  styleUrl: './grip-diagram.component.scss'
})
export class GripDiagramComponent implements OnChanges {
  @Input() grip!: Grip | undefined;

  public svg: SafeHtml = '';

  constructor(private sanitizer: DomSanitizer) {

  }

  ngOnChanges(changes: SimpleChanges): void {
    changes['grip']?.currentValue && this.updateSvg(changes['grip']?.currentValue);
  }

  updateSvg(grip: Grip): void {
    this.svg = this.sanitizer.bypassSecurityTrustHtml(this.createSvg());
  }

  createSvg(): string {
    if (!this.grip) return '';
    const stringCount = 6;
    const fretCount = 5;
    const fretHeight = 30;
    const stringSpacing = 20;
    const radius = 6;
    const barreThickness = 12; // Thinner barre line

    const width = stringSpacing * (stringCount - 1) + 40;
    const height = fretHeight * fretCount + 60;

    const minFret = Math.min(
      ...this.grip.strings
        .map((s: any) => {
          if (Array.isArray(s)) {
            return Math.min(...s.map((f: any) => f.fret));
          }

          return 9001;
        })
    );
    const startFret = (minFret === 9001) ? 1 : (minFret > 1) ? minFret : 1;

    const lines: string[] = [];
    const dots: string[] = [];

    // Strings
    for (let i = 0; i < stringCount; i++) {
      const x = 20 + i * stringSpacing;
      lines.push(`<line x1="${x}" y1="40" x2="${x}" y2="${40 + fretCount * fretHeight}" stroke="black"/>`);
    }

    // Frets
    for (let i = 0; i <= fretCount; i++) {
      const y = 40 + i * fretHeight;
      const thickness = (startFret === 1 && i === 0) ? ' stroke-width="5"' : '';
      lines.push(`<line x1="20" y1="${y}" x2="${20 + stringSpacing * (stringCount - 1)}" y2="${y}" stroke="black"${thickness}/>`);
    }

    // Fret label if needed
    const label = startFret > 1
      ? `<text x="0" y="${40 + fretHeight / 2}" font-size="12">${startFret}</text>`
      : '';

    // Draw grip
    const barres: Map<number, number[]> = new Map();
    this.grip.strings.forEach((string: any, i: number) => {
      const x = 20 + i * stringSpacing;
      if (string === 'x') {
        dots.push(`<text x="${x - 4}" y="25" font-size="14">x</text>`);
      } else if (string === 'o') {
        dots.push(`<text x="${x - 4}" y="25" font-size="14">o</text>`);
      } else if (Array.isArray(string)) {
        string.forEach(placement => {
          if (placement.isPartOfBarre) {
            if (!barres.has(placement.fret)) {
              barres.set(placement.fret, []);
            }
            barres.get(placement.fret)?.push(i);
          }

          const y = 40 + ((placement.fret - startFret) + 0.5) * fretHeight;
          dots.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="black"/>`);
        })
      }
    });

    barres.forEach((strings, fret) => {
      for (const group of this.groupContiguousStrings(strings)) {
        if (group.length < 2) {
          continue;
        }

        const y = 40 + ((fret - startFret) + 0.5) * fretHeight;
        const x1 = 20 + group[0] * stringSpacing;
        const x2 = 20 + group[group.length - 1] * stringSpacing;
        lines.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="black" stroke-width="${barreThickness}" stroke-linecap="round"/>`);
      }
    });

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        ${lines.join('\n')}
        ${dots.join('\n')}
        ${label}
      </svg>
    `;
  }

  private groupContiguousStrings(strings: number[]): number[][] {
    if (strings.length === 0) {
      return [];
    }

    const sorted = [...new Set(strings)].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];

    for (let index = 1; index < sorted.length; index++) {
      const value = sorted[index];
      const group = groups[groups.length - 1];
      if (value === group[group.length - 1] + 1) {
        group.push(value);
      } else {
        groups.push([value]);
      }
    }

    return groups;
  }
}
