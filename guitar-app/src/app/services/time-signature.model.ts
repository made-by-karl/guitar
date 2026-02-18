export const TIME_SIGNATURES = [
	'2/4',
	'3/4',
	'4/4',
	'5/4_23',
	'5/4_32',
	'5/4',
	'6/8',
	'7/8_223',
	'7/8_322',
	'7/8',
	'9/8',
	'12/8'
] as const;

export type TimeSignature = (typeof TIME_SIGNATURES)[number];

export interface TimeSignatureParts {
	top: number;
	bottom: 4 | 8;
}

const TIME_SIGNATURE_PARTS_BY_SIGNATURE: Record<TimeSignature, TimeSignatureParts> = {
	'2/4': { top: 2, bottom: 4 },
	'3/4': { top: 3, bottom: 4 },
	'4/4': { top: 4, bottom: 4 },
	'5/4_23': { top: 5, bottom: 4 },
	'5/4_32': { top: 5, bottom: 4 },
	'5/4': { top: 5, bottom: 4 },
	'6/8': { top: 6, bottom: 8 },
	'7/8_223': { top: 7, bottom: 8 },
	'7/8_322': { top: 7, bottom: 8 },
	'7/8': { top: 7, bottom: 8 },
	'9/8': { top: 9, bottom: 8 },
	'12/8': { top: 12, bottom: 8 }
};

const TIME_SIGNATURE_LABEL_BY_SIGNATURE: Record<TimeSignature, string> = {
	'2/4': '2/4',
	'3/4': '3/4',
	'4/4': '4/4',
	'5/4_23': '5/4 (2+3)',
	'5/4_32': '5/4 (3+2)',
	'5/4': '5/4',
	'6/8': '6/8',
	'7/8_223': '7/8 (2+2+3)',
	'7/8_322': '7/8 (3+2+2)',
	'7/8': '7/8',
	'9/8': '9/8',
	'12/8': '12/8'
};

export const ACCENTED_BEATS_BY_TIME_SIGNATURE: Record<TimeSignature, readonly number[]> = {
	'2/4': [1],
	'3/4': [1],
	'4/4': [1],
	'5/4_23': [1, 3],
	'5/4_32': [1, 4],
	'5/4': [1],
	'6/8': [1, 4],
	'7/8_223': [1, 3, 5],
	'7/8_322': [1, 4, 6],
	'7/8': [1],
	'9/8': [1, 4, 7],
	'12/8': [1, 4, 7, 10]
};

export function getTimeSignatureParts(timeSignature: TimeSignature): TimeSignatureParts {
	return TIME_SIGNATURE_PARTS_BY_SIGNATURE[timeSignature];
}

export function timeSignatureLabel(timeSignature: TimeSignature): string {
	return TIME_SIGNATURE_LABEL_BY_SIGNATURE[timeSignature];
}

export function getAccentedBeats(timeSignature: TimeSignature): readonly number[] {
	return ACCENTED_BEATS_BY_TIME_SIGNATURE[timeSignature];
}

export function isTimeSignature(value: unknown): value is TimeSignature {
	return typeof value === 'string' && (TIME_SIGNATURES as readonly string[]).includes(value);
}

export function parseTimeSignature(value: unknown, fallback: TimeSignature = '4/4'): TimeSignature {
	return isTimeSignature(value) ? value : fallback;
}
