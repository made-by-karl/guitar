import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { GuitarGrip } from '../../services/grip-generator/grip-generator.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-grip-diagram',
  imports: [],
  templateUrl: './grip-diagram.component.html',
  styleUrl: './grip-diagram.component.scss'
})
export class GripDiagramComponent implements OnChanges {
  @Input() grip!: GuitarGrip;

  public svg: any;

  constructor(private sanitizer: DomSanitizer) {
    
  }

  ngOnChanges(changes: SimpleChanges): void {
    changes['grip']?.currentValue && this.updateSvg(changes['grip']?.currentValue);
  }

  updateSvg(grip: GuitarGrip): void {
    this.svg = this.sanitizer.bypassSecurityTrustHtml(this.createSvg());
  }

  createSvg(): string {
    if (!this.grip) return '';
    const stringCount = 6;
    const fretCount = 5;
    const fretHeight = 30;
    const stringSpacing = 20;
    const radius = 6;

    const width = stringSpacing * (stringCount - 1) + 40;
    const height = fretHeight * fretCount + 60;

    const fretted = this.grip.frets.filter(f => typeof f === 'number') as number[];
    const minFret = Math.min(...fretted, 1);
    const startFret = minFret > 1 ? minFret : 1;

    const lines: string[] = [];
    const dots: string[] = [];
    const barres: string[] = [];

    // Strings
    for (let i = 0; i < stringCount; i++) {
      const x = 20 + i * stringSpacing;
      lines.push(`<line x1="${x}" y1="40" x2="${x}" y2="${40 + fretCount * fretHeight}" stroke="black"/>`);
    }

    // Frets
    for (let i = 0; i <= fretCount; i++) {
      const y = 40 + i * fretHeight;
      lines.push(`<line x1="20" y1="${y}" x2="${20 + stringSpacing * (stringCount - 1)}" y2="${y}" stroke="black"/>`);
    }

    // Fret label if needed
    const label = startFret > 1
      ? `<text x="0" y="${40 + fretHeight / 2}" font-size="12">${startFret}</text>`
      : '';

    // Detect barres
    const fretMap: Map<number, number[]> = new Map(); // fret -> string indexes
    this.grip.frets.forEach((fret, i) => {
      if (typeof fret === 'number' && fret !== 0) {
        if (!fretMap.has(fret)) fretMap.set(fret, []);
        fretMap.get(fret)!.push(i);
      }
    });

    fretMap.forEach((strings, fret) => {
      if (strings.length >= 2 && strings.every(i => typeof this.grip.frets[i] === 'number')) {
        const x1 = 20 + Math.min(...strings) * stringSpacing;
        const x2 = 20 + Math.max(...strings) * stringSpacing;
        const y = 40 + ((fret - startFret) + 0.5) * fretHeight;
        barres.push(`<rect x="${x1 - radius}" y="${y - radius}" width="${x2 - x1 + 2 * radius}" height="${radius * 2}" rx="${radius}" fill="black"/>`);
      }
    });

    // Fretting dots
    this.grip.frets.forEach((fret, i) => {
      const x = 20 + i * stringSpacing;
      if (fret === 'x') {
        dots.push(`<text x="${x - 4}" y="25" font-size="14">x</text>`);
      } else if (fret === 0) {
        dots.push(`<circle cx="${x}" cy="35" r="${radius}" fill="white" stroke="black"/>`);
      } else if (typeof fret === 'number') {
        const y = 40 + ((fret - startFret) + 0.5) * fretHeight;
        // Only render dot if not part of barre
        const isPartOfBarre = fretMap.get(fret)?.length! >= 2;
        if (!isPartOfBarre) {
          dots.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="black"/>`);
        }
      }
    });

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        ${lines.join('\n')}
        ${barres.join('\n')}
        ${dots.join('\n')}
        ${label}
      </svg>
    `;
  }
}
