export function applyNoColor(noColor: string | boolean | (string | boolean)[] | undefined): void {
  let effective: boolean;
  if (Array.isArray(noColor)) {
    const last = noColor[noColor.length - 1];
    effective = last === true || last === '1' || last === 'true';
  } else if (typeof noColor === 'string') {
    effective = noColor === '1' || noColor === 'true';
  } else {
    effective = noColor === true;
  }
  if (effective) {
    process.env['NO_COLOR'] = '1';
  }
}
